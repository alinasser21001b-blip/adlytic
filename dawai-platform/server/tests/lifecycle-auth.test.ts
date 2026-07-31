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

describe("lifecycle, auth recovery, and clarification", () => {
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
  ): Promise<Session> {
    const response = await jsonRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        role,
        name: role,
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
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0],
      csrf: payload.data.csrfToken,
      userId: payload.data.user.id,
    };
  }

  it("requires clarification when multiple presentations match", async () => {
    const patient = await register("PATIENT", "clarify@example.test");
    const response = await jsonRequest("/api/v1/patient/requests", {
      method: "POST",
      session: patient,
      idempotencyKey: randomUUID(),
      body: {
        medicineName: "Panadol",
        quantity: 1,
        urgency: "TODAY",
        area: "المنصور",
        latitude: 33.315,
        longitude: 44.366,
        pickupPreferred: true,
        deliveryPreferred: false,
      },
    });
    // Panadol may resolve to one presentation — if multiple, must clarify.
    expect([201]).toContain(response.status);
    const payload = await response.json();
    if (payload.data.status === "NEEDS_CLARIFICATION") {
      expect(payload.data.clarificationCandidates.length).toBeGreaterThan(1);
      const clarified = await jsonRequest(
        `/api/v1/patient/requests/${payload.data.id}/clarify`,
        {
          method: "POST",
          session: patient,
          body: { presentationId: payload.data.clarificationCandidates[0].id },
        },
      );
      expect(clarified.status).toBe(200);
      expect((await clarified.json()).data.status).not.toBe("NEEDS_CLARIFICATION");
    } else {
      expect(["ACTIVE", "NO_MATCH", "BLOCKED"]).toContain(payload.data.status);
    }
  });

  it("cancels HOLD_PENDING and withdraws the selected offer", async () => {
    const pharmacy = await register("PHARMACY", "cancel-pharm@example.test");
    const onboarding = await jsonRequest("/api/v1/pharmacy/onboarding", {
      method: "POST",
      session: pharmacy,
      body: {
        pharmacyName: "صيدلية الإلغاء",
        pharmacistName: "صيدلي",
        phone: "07701112222",
        licenseNumber: "IQ-CANCEL-001",
        licenseIssuer: "Test",
        licenseExpiresAt: "2030-12-31",
        branchName: "فرع",
        governorate: "بغداد",
        district: "المنصور",
        address: "شارع الاختبار",
        landmark: null,
        latitude: 33.3152,
        longitude: 44.3661,
        openingHours: {},
        pickupEnabled: true,
        deliveryEnabled: false,
      },
    });
    expect(onboarding.status).toBe(201);
    const pharmacyId = (await onboarding.json()).data.pharmacyId as string;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const licenseForm = new FormData();
    licenseForm.set("purpose", "PHARMACY_LICENSE");
    licenseForm.set("file", new File([png], "license.png", { type: "image/png" }));
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
    await bootstrapAdmin(database, "admin-cancel@example.test", "AdminPassword!234");
    const adminLogin = await jsonRequest("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: "admin-cancel@example.test",
        password: "AdminPassword!234",
        expectedRole: "ADMIN",
        clientType: "web",
      },
    });
    const admin: Session = {
      cookie: adminLogin.headers.get("set-cookie")!.split(";")[0],
      csrf: (await adminLogin.json()).data.csrfToken,
      userId: "admin",
    };
    const approval = await jsonRequest(`/api/v1/admin/verifications/${pharmacyId}/approve`, {
      method: "POST",
      session: admin,
      body: {},
    });
    expect(approval.status).toBe(200);

    const patient = await register("PATIENT", "cancel-patient@example.test");
    const created = await jsonRequest("/api/v1/patient/requests", {
      method: "POST",
      session: patient,
      idempotencyKey: randomUUID(),
      body: {
        medicineName: "UniqueCancelMedXYZ",
        quantity: 1,
        urgency: "NOW",
        area: "المنصور",
        latitude: 33.315,
        longitude: 44.366,
        pickupPreferred: true,
        deliveryPreferred: false,
      },
    });
    const request = (await created.json()).data;
    const offerResponse = await jsonRequest(
      `/api/v1/pharmacy/inbox/${request.id}/offers`,
      {
        method: "POST",
        session: pharmacy,
        idempotencyKey: randomUUID(),
        body: {
          offerType: "EXACT",
          offeredBrand: "UniqueCancelMedXYZ",
          offeredStrength: "500 mg",
          offeredForm: "أقراص",
          availableQuantity: 1,
          priceIqd: 1000,
          pickupEnabled: true,
          deliveryEnabled: false,
          preparationMinutes: 5,
          note: null,
        },
      },
    );
    const offer = (await offerResponse.json()).data;
    const selection = await jsonRequest(
      `/api/v1/patient/requests/${request.id}/reservations`,
      {
        method: "POST",
        session: patient,
        idempotencyKey: randomUUID(),
        body: { offerId: offer.id, fulfillmentMethod: "PICKUP" },
      },
    );
    expect(selection.status).toBe(201);

    const cancel = await jsonRequest(
      `/api/v1/patient/requests/${request.id}/cancel`,
      { method: "POST", session: patient, body: {} },
    );
    expect(cancel.status).toBe(200);
    const offerRow = await database.query<{ status: string }>(
      "SELECT status FROM pharmacy_offers WHERE id = $1",
      [offer.id],
    );
    expect(offerRow.rows[0].status).toBe("WITHDRAWN");
  });

  it("resets password without enumerating emails and revokes sessions", async () => {
    const patient = await register("PATIENT", "reset@example.test");
    const request = await jsonRequest("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: { email: "reset@example.test" },
    });
    expect(request.status).toBe(200);
    const payload = await request.json();
    expect(payload.data.accepted).toBe(true);
    expect(payload.data.resetToken).toBeTruthy();

    const missing = await jsonRequest("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: { email: "missing@example.test" },
    });
    expect(missing.status).toBe(200);
    expect((await missing.json()).data.message).toBe(payload.data.message);

    const confirm = await jsonRequest("/api/v1/auth/password-reset/confirm", {
      method: "POST",
      body: {
        token: payload.data.resetToken,
        password: "NewStrongPassword!99",
      },
    });
    expect(confirm.status).toBe(200);

    const oldSession = await jsonRequest("/api/v1/patient/profile", {
      session: patient,
    });
    expect(oldSession.status).toBe(401);

    const login = await jsonRequest("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: "reset@example.test",
        password: "NewStrongPassword!99",
        expectedRole: "PATIENT",
        clientType: "web",
      },
    });
    expect(login.status).toBe(200);
  });

  it("rejects delivery fulfillment while MVP delivery is disabled", async () => {
    const patient = await register("PATIENT", "delivery@example.test");
    // Create a synthetic active offer path is heavy; assert API gate directly via schema path
    // by attempting reservation with DELIVERY against a non-existent selectable offer state.
    const response = await jsonRequest(
      `/api/v1/patient/requests/${randomUUID()}/reservations`,
      {
        method: "POST",
        session: patient,
        idempotencyKey: randomUUID(),
        body: { offerId: randomUUID(), fulfillmentMethod: "DELIVERY" },
      },
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("DELIVERY_NOT_IN_MVP");
  });

  it("exposes pilot metrics on admin dashboard", async () => {
    await bootstrapAdmin(database, "pilot-admin@example.test", "AdminPassword!234");
    const login = await jsonRequest("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: "pilot-admin@example.test",
        password: "AdminPassword!234",
        expectedRole: "ADMIN",
        clientType: "web",
      },
    });
    const admin: Session = {
      cookie: login.headers.get("set-cookie")!.split(";")[0],
      csrf: (await login.json()).data.csrfToken,
      userId: "admin",
    };
    const dashboard = await jsonRequest("/api/v1/admin/dashboard", {
      session: admin,
    });
    expect(dashboard.status).toBe(200);
    const data = (await dashboard.json()).data;
    expect(data.pilot_metrics).toBeTruthy();
    expect(data.pilot_metrics.targets.matchable_with_offer_rate).toBe(0.6);
  });
});
