/**
 * Branded identifiers.
 *
 * @blueprint §2 · Account · Subject · Request · Offer · Reservation
 * @owner platform-foundation
 * @why Every entity in the domain model has an id, and several of them appear
 *      together in the same call — a request carries a subject id and an acting
 *      account id, and Blueprint §2 invariant 1 says those are frequently
 *      different people. Branding makes passing one where the other is expected
 *      a compile error rather than a clinical incident.
 * @implements domain/ids
 */

declare const brand: unique symbol;
type Branded<K extends string> = string & { readonly [brand]: K };

export type AccountId = Branded<"AccountId">;
export type SubjectId = Branded<"SubjectId">;
export type GrantId = Branded<"GrantId">;
export type RequestId = Branded<"RequestId">;
export type RequestLineId = Branded<"RequestLineId">;
export type OfferId = Branded<"OfferId">;
export type OfferLineId = Branded<"OfferLineId">;
export type ReservationId = Branded<"ReservationId">;
export type DispenseId = Branded<"DispenseId">;
export type ItemId = Branded<"ItemId">;
export type DistrictId = Branded<"DistrictId">;
export type BranchId = Branded<"BranchId">;
export type StaffId = Branded<"StaffId">;
export type LicenceId = Branded<"LicenceId">;
export type ImageId = Branded<"ImageId">;
export type WatchId = Branded<"WatchId">;

/** Ids are minted by infrastructure, never by the domain — the domain is pure
 *  and an id generator is a source of nondeterminism. These only tag. */
export const asAccountId = (s: string) => s as AccountId;
export const asSubjectId = (s: string) => s as SubjectId;
export const asGrantId = (s: string) => s as GrantId;
export const asRequestId = (s: string) => s as RequestId;
export const asRequestLineId = (s: string) => s as RequestLineId;
export const asOfferId = (s: string) => s as OfferId;
export const asOfferLineId = (s: string) => s as OfferLineId;
export const asReservationId = (s: string) => s as ReservationId;
export const asDispenseId = (s: string) => s as DispenseId;
export const asItemId = (s: string) => s as ItemId;
export const asDistrictId = (s: string) => s as DistrictId;
export const asBranchId = (s: string) => s as BranchId;
export const asStaffId = (s: string) => s as StaffId;
export const asLicenceId = (s: string) => s as LicenceId;
export const asImageId = (s: string) => s as ImageId;
export const asWatchId = (s: string) => s as WatchId;
