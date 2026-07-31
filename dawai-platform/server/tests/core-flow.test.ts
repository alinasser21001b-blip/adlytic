// @vitest-environment node

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { bootstrapAdmin } from "../routes/admin";
import { createDatabase, type Database } from "../db/client";

interface Session {
  cookie: string;
  csrf: string;
  userId: string;
}

describe("Dawai production core loop", () => {
  let database: Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    database = await createDatabase({ memory: true, migrate: true });
    app = createApp(database);
  });

  afterEach(async () => {
    await database?.close();
  });

  async function jsonRequest(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      session?: Session;
      idempotencyKey?: string;
    } = {},
  ) {
    const headers = new Headers({
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    });
    if (options.session) {
      headers.set("Cookie", options.session.cookie);
      headers.set("X-CSRF-Token", options.session.csrf);
    }
    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }
    return app.request(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  async function register(
    role: "PATIENT" | "PHARMACY",
    email: string,
    name: string,
  ): Promise<Session> {
    const response = await jsonRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        role,
        name,
        email,
        phone: "07701234567",
        password: "StrongPassword!234",
        clientType: "web",
        acceptPrivacy: true,
        acceptTerms: true,
        acceptPharmacyTerms: role === "PHARMACY" ? true : undefined,
      },
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();
    return {
      cookie: cookie!,
      csrf: payload.data.csrfToken,
      userId: payload.data.user.id,
    };
  }

  async function login(
    email: string,
    password: string,
    expectedRole: "PATIENT" | "PHARMACY" | "ADMIN",
  ): Promise<Session> {
    const response = await jsonRequest("/api/v1/auth/login", {
      method: "POST",
      body: { email, password, expectedRole, clientType: "web" },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0],
      csrf: payload.data.csrfToken,
      userId: payload.data.user.id,
    };
  }

  async function createVerifiedPharmacy() {
    const pharmacy = await register(
      "PHARMACY",
      "pharmacy@example.test",
      "صيدلية الاختبار",
    );
    const onboarding = await jsonRequest("/api/v1/pharmacy/onboarding", {
      method: "POST",
      session: pharmacy,
      body: {
        pharmacyName: "صيدلية الروابي",
        pharmacistName: "الصيدلي أحمد",
        phone: "07701112222",
        licenseNumber: "IQ-TEST-001",
        licenseIssuer: "Test health authority",
        licenseExpiresAt: "2030-12-31",
        branchName: "فرع المنصور",
        governorate: "بغداد",
        district: "المنصور",
        address: "شارع 14 رمضان",
        landmark: "قرب الساحة",
        latitude: 33.3152,
        longitude: 44.3661,
        openingHours: {},
        pickupEnabled: true,
        deliveryEnabled: true,
      },
    });
    expect(onboarding.status).toBe(201);
    const onboardingBody = await onboarding.json();

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const licenseForm = new FormData();
    licenseForm.set("purpose", "PHARMACY_LICENSE");
    licenseForm.set(
      "file",
      new File([png], "license.png", { type: "image/png" }),
    );
    const licenseUpload = await app.request("/api/v1/files", {
      method: "POST",
      headers: {
        Cookie: pharmacy.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": pharmacy.csrf,
      },
      body: licenseForm,
    });
    expect(licenseUpload.status).toBe(201);

    await bootstrapAdmin(
      database,
      "admin@example.test",
      "AdminPassword!234",
    );
    const admin = await login(
      "admin@example.test",
      "AdminPassword!234",
      "ADMIN",
    );
    const approval = await jsonRequest(
      `/api/v1/admin/verifications/${onboardingBody.data.pharmacyId}/approve`,
      { method: "POST", session: admin, body: {} },
    );
    expect(approval.status).toBe(200);
    return {
      session: pharmacy,
      pharmacyId: onboardingBody.data.pharmacyId as string,
      branchId: onboardingBody.data.branchId as string,
      admin,
    };
  }

  it("completes patient → pharmacy → reservation → pickup with real state", async () => {
    const pharmacy = await createVerifiedPharmacy();
    const inventoryUpdate = await jsonRequest("/api/v1/pharmacy/inventory", {
      method: "POST",
      session: pharmacy.session,
      body: {
        medicineName: "Metformin Test",
        presentationId: null,
        state: "AVAILABLE",
        quantity: 3,
        freshnessMinutes: 60,
      },
    });
    expect(inventoryUpdate.status).toBe(201);
    const directAvailability = await jsonRequest(
      "/api/v1/availability?medicine=Metformin%20Test&lat=33.315&lng=44.366&radiusKm=2",
    );
    expect(directAvailability.status).toBe(200);
    expect((await directAvailability.json()).data).toHaveLength(1);

    const patient = await register(
      "PATIENT",
      "patient@example.test",
      "مريض الاختبار",
    );

    const requestResponse = await jsonRequest("/api/v1/patient/requests", {
      method: "POST",
      session: patient,
      idempotencyKey: randomUUID(),
      body: {
        medicineName: "Augmentin",
        presentationId: "pres-augmentin-625-14",
        strength: "625 mg",
        dosageForm: "أقراص",
        quantity: 1,
        urgency: "NOW",
        area: "المنصور",
        latitude: 33.315,
        longitude: 44.366,
        pickupPreferred: true,
        deliveryPreferred: false,
      },
    });
    expect(requestResponse.status).toBe(201);
    const request = (await requestResponse.json()).data;
    expect(request.status).toBe("ACTIVE");
    expect(Number(request.dispatched_count)).toBe(1);

    const inboxResponse = await jsonRequest("/api/v1/pharmacy/inbox", {
      session: pharmacy.session,
    });
    expect(inboxResponse.status).toBe(200);
    const inbox = (await inboxResponse.json()).data;
    expect(inbox).toHaveLength(1);
    expect(inbox[0].id).toBe(request.id);

    const offerResponse = await jsonRequest(
      `/api/v1/pharmacy/inbox/${request.id}/offers`,
      {
        method: "POST",
        session: pharmacy.session,
        idempotencyKey: randomUUID(),
        body: {
          offerType: "EXACT",
          offeredBrand: "Augmentin",
          offeredStrength: "625 mg",
          offeredForm: "أقراص",
          availableQuantity: 2,
          priceIqd: 12000,
          pickupEnabled: true,
          deliveryEnabled: true,
          preparationMinutes: 10,
          note: "أحضر الوصفة الأصلية.",
        },
      },
    );
    expect(offerResponse.status).toBe(201);
    const offer = (await offerResponse.json()).data;

    const patientOffers = await jsonRequest(
      `/api/v1/patient/requests/${request.id}/offers`,
      { session: patient },
    );
    expect(patientOffers.status).toBe(200);
    expect((await patientOffers.json()).data[0].price_iqd).toBe(12000);

    const selectionResponse = await jsonRequest(
      `/api/v1/patient/requests/${request.id}/reservations`,
      {
        method: "POST",
        session: patient,
        idempotencyKey: randomUUID(),
        body: { offerId: offer.id, fulfillmentMethod: "PICKUP" },
      },
    );
    expect(selectionResponse.status).toBe(201);
    const reservation = (await selectionResponse.json()).data;
    expect(reservation.status).toBe("PENDING_ACK");
    expect(reservation.fulfillment_method).toBe("PICKUP");
    expect(reservation.hold_expires_at).toBeNull();

    const acknowledge = await jsonRequest(
      `/api/v1/pharmacy/reservations/${reservation.id}/acknowledge`,
      { method: "POST", session: pharmacy.session, body: {} },
    );
    expect(acknowledge.status).toBe(200);
    expect((await acknowledge.json()).data.status).toBe("ACTIVE");

    const ready = await jsonRequest(
      `/api/v1/pharmacy/reservations/${reservation.id}/ready`,
      { method: "POST", session: pharmacy.session, body: {} },
    );
    expect(ready.status).toBe(200);

    const complete = await jsonRequest(
      `/api/v1/pharmacy/reservations/${reservation.id}/complete`,
      { method: "POST", session: pharmacy.session, body: {} },
    );
    expect(complete.status).toBe(200);

    const finalRequest = await jsonRequest(
      `/api/v1/patient/requests/${request.id}`,
      { session: patient },
    );
    expect(finalRequest.status).toBe(200);
    const finalPayload = (await finalRequest.json()).data;
    expect(finalPayload.status).toBe("COMPLETED");
    expect(finalPayload.reservation.status).toBe("COMPLETED");
  });

  it("enforces server-side role and pharmacy verification boundaries", async () => {
    const patient = await register(
      "PATIENT",
      "boundary-patient@example.test",
      "Patient",
    );
    const pharmacy = await register(
      "PHARMACY",
      "boundary-pharmacy@example.test",
      "Pharmacy",
    );

    const roleEscalation = await jsonRequest("/api/v1/pharmacy/inbox", {
      session: patient,
    });
    expect(roleEscalation.status).toBe(403);

    const unverifiedInbox = await jsonRequest("/api/v1/pharmacy/inbox", {
      session: pharmacy,
    });
    expect(unverifiedInbox.status).toBe(403);
  });

  it("blocks CSRF, cross-patient IDOR, and automatic alternative reservation", async () => {
    const pharmacy = await createVerifiedPharmacy();
    const owner = await register(
      "PATIENT",
      "security-owner@example.test",
      "Request Owner",
    );
    const stranger = await register(
      "PATIENT",
      "security-stranger@example.test",
      "Other Patient",
    );

    const csrfAttack = await app.request("/api/v1/patient/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: owner.cookie,
        Origin: "https://evil.example",
        "X-CSRF-Token": owner.csrf,
      },
      body: JSON.stringify({
        name: "Changed",
        phone: null,
        defaultArea: null,
        latitude: null,
        longitude: null,
        notificationPreferences: { inApp: true, push: false },
      }),
    });
    expect(csrfAttack.status).toBe(403);

    const created = await jsonRequest("/api/v1/patient/requests", {
      method: "POST",
      session: owner,
      idempotencyKey: randomUUID(),
      body: {
        medicineName: "Panadol Extra",
        quantity: 1,
        urgency: "TODAY",
        area: "المنصور",
        latitude: 33.315,
        longitude: 44.366,
        pickupPreferred: true,
        deliveryPreferred: false,
      },
    });
    expect(created.status).toBe(201);
    const request = (await created.json()).data;

    const idorRead = await jsonRequest(
      `/api/v1/patient/requests/${request.id}`,
      { session: stranger },
    );
    expect(idorRead.status).toBe(404);

    const alternative = await jsonRequest(
      `/api/v1/pharmacy/inbox/${request.id}/offers`,
      {
        method: "POST",
        session: pharmacy.session,
        idempotencyKey: randomUUID(),
        body: {
          offerType: "ALTERNATIVE_REVIEW_REQUIRED",
          offeredBrand: "Different pharmacist-reviewed product",
          offeredStrength: "500 mg",
          offeredForm: "أقراص",
          availableQuantity: 1,
          priceIqd: 5000,
          pickupEnabled: true,
          deliveryEnabled: false,
          preparationMinutes: 5,
          note: "يتطلب مراجعة الصيدلي والوصفة.",
        },
      },
    );
    expect(alternative.status).toBe(201);
    const offer = (await alternative.json()).data;

    const unsafeSelection = await jsonRequest(
      `/api/v1/patient/requests/${request.id}/reservations`,
      {
        method: "POST",
        session: owner,
        idempotencyKey: randomUUID(),
        body: { offerId: offer.id },
      },
    );
    expect(unsafeSelection.status).toBe(422);
    expect((await unsafeSelection.json()).error.code).toBe(
      "ALTERNATIVE_REQUIRES_REVIEW",
    );
  });

  it("validates, encrypts, authorizes, and decrypts prescription images", async () => {
    const patient = await register(
      "PATIENT",
      "upload-patient@example.test",
      "Upload Patient",
    );
    const pharmacy = await register(
      "PHARMACY",
      "upload-pharmacy@example.test",
      "Upload Pharmacy",
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );

    const validForm = new FormData();
    validForm.set("purpose", "PRESCRIPTION");
    validForm.set("file", new File([png], "prescription.png", { type: "image/png" }));
    const validUpload = await app.request("/api/v1/files", {
      method: "POST",
      headers: {
        Cookie: patient.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": patient.csrf,
      },
      body: validForm,
    });
    expect(validUpload.status).toBe(201);
    const file = (await validUpload.json()).data;

    const metadata = await database.query<{
      nonce: string;
      auth_tag: string;
      storage_key: string;
      media_type: string;
    }>(
      `SELECT nonce, auth_tag, storage_key, media_type
       FROM secure_files WHERE id = $1`,
      [file.id],
    );
    expect(metadata.rows[0].nonce).not.toBe("");
    expect(metadata.rows[0].auth_tag).not.toBe("");
    expect(metadata.rows[0].storage_key).not.toContain("prescription");
    expect(metadata.rows[0].media_type).toBe("image/jpeg");

    const ownerRead = await app.request(`/api/v1/files/${file.id}`, {
      headers: { Cookie: patient.cookie },
    });
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.headers.get("cache-control")).toContain("no-store");
    const decrypted = Buffer.from(await ownerRead.arrayBuffer());
    expect(decrypted.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    const unauthorizedRead = await app.request(`/api/v1/files/${file.id}`, {
      headers: { Cookie: pharmacy.cookie },
    });
    expect(unauthorizedRead.status).toBe(404);

    const invalidForm = new FormData();
    invalidForm.set("purpose", "PRESCRIPTION");
    invalidForm.set(
      "file",
      new File(["<script>alert(1)</script>"], "fake.jpg", {
        type: "image/jpeg",
      }),
    );
    const invalidUpload = await app.request("/api/v1/files", {
      method: "POST",
      headers: {
        Cookie: patient.cookie,
        Origin: "http://localhost:5173",
        "X-CSRF-Token": patient.csrf,
      },
      body: invalidForm,
    });
    expect(invalidUpload.status).toBe(415);
  });
});
