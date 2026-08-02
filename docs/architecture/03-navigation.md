# 03 — Navigation Architecture

## Principles

1. **Tabs are destinations, not actions.** Anything that creates something is a
   floating action or a sheet, never a tab.
2. **Maximum depth is three from a tab root.** Deeper means the information
   architecture is wrong, not that the user needs another back button.
3. **A modal never leads to a tab.** Modals return to where they were opened.
4. **The safety layer is not navigation.** A severe alert is a layer over the
   entire app, unreachable by back, and does not participate in the stack.
5. **Every tab remembers its own stack.** Switching tabs and returning restores
   position — the Instagram/iOS convention users already have.
6. **Deep links resolve to a full stack, not a bare screen.** A push
   notification that opens a detail screen with no parent leaves the user
   trapped with no way back.

## Patient app

```mermaid
graph TB
  Splash --> Gate{"Session?"}
  Gate -->|no| Onboard[Onboarding] --> Auth[Phone + OTP] --> Consent[Permissions primer] --> Home
  Gate -->|yes| Home

  Home["🏠 اليوم<br/>Today"]
  Meds["💊 أدويتي<br/>Medicines"]
  Find["🔍 ابحث<br/>Find"]
  Me["👤 حسابي<br/>Me"]

  Home --- Meds --- Find --- Me

  Home --> DoseDetail[Dose detail]
  Home --> ActiveRes[Active reservation]
  Home --> Timeline[Medication timeline]

  Meds --> MedDetail[Medicine detail]
  MedDetail --> Schedule[Schedule & reminders]
  MedDetail --> History[Refill history]
  MedDetail --> Interactions[Interaction info]

  Find --> Search[Search results]
  Find --> Map[Map of pharmacies]
  Find --> PharmacyDetail[Pharmacy detail]
  Search --> ItemDetail[Catalogue item]
  Map --> PharmacyDetail

  Me --> Family[Family & access]
  Me --> Notifications[Notification settings]
  Me --> Orders[Reservation history]
  Me --> Favorites[Saved pharmacies]
  Me --> Documents[Prescriptions]
  Me --> AccessLog[Who viewed my data]
  Me --> Settings[Settings]
  Settings --> DeleteAccount[Delete account]

  FAB(["＋ Request"]) -.-> Capture
  Capture[Capture: camera · voice · type] --> Confirm[Confirm request]
  Confirm --> Live[Live responses]
  Live --> Offers[Compare offers]
  Offers --> Hold[Reservation pass]
  Hold --> Pickup[Pickup / expired]

  Alert{{"Safety layer<br/>above everything"}}
```

**Four tabs, chosen deliberately.** Today (what do I do now), Medicines (what
am I on), Find (I need something), Me. `Orders` is not a tab: a reservation is
either active — in which case it belongs on Today — or finished, in which case
it is history. A tab for a thing that is usually empty teaches the user to
ignore a tab.

**The FAB owns request creation.** One entry point for anything new, with
camera and voice **before** typing, because the target user photographs a
prescription far more readily than they type a drug name in Latin script.

## Pharmacy app

```mermaid
graph TB
  Splash --> Auth[Staff sign-in] --> Branch{"Multiple branches?"}
  Branch -->|yes| Pick[Select branch] --> Inbox
  Branch -->|no| Inbox

  Inbox["📥 الوارد<br/>Requests"]
  Holds["🔒 الحجوزات<br/>Holds"]
  Stock["📦 المخزون<br/>Stock"]
  Shop["🏪 الفرع<br/>Branch"]

  Inbox --- Holds --- Stock --- Shop

  Inbox --> Request[Request detail]
  Request --> Compose[Compose offer]
  Request --> Decline[Unavailable + reason]
  Compose --> Sent[Offer sent]

  Holds --> HoldDetail[Hold detail]
  HoldDetail --> Confirm[Confirm — stock reserved]
  HoldDetail --> Fail[Cannot hold + reason]
  HoldDetail --> Handover[Pickup: verify code]
  Handover --> Complete[Completed]

  Stock --> SKU[SKU detail]
  SKU --> Count[Spot count]
  SKU --> Movement[Movement log]
  Stock --> LowTrust[Low-trust SKUs]

  Shop --> Hours[Opening hours]
  Shop --> Coverage[Coverage & capacity]
  Shop --> Offers[Promotions]
  Shop --> Staff[Staff & roles]
  Shop --> Analytics[Analytics]
  Shop --> Customers[Returning customers]
  Shop --> Licence[Licence & verification]
```

**Inbox is the root, not a dashboard.** A pharmacist opening the app has one
question: is there anything waiting for me. A dashboard of charts as the
landing screen is a product designed for the person who bought it rather than
the person who uses it.

**Holds are separated from Inbox** because they are a different commitment: an
inbox item costs nothing to ignore, a hold has physical stock behind it and a
customer walking towards the door.

## Owner console

```mermaid
graph TB
  Login[SSO + hardware 2FA] --> Overview

  Overview["Overview<br/>health · queues · incidents"]

  Overview --> Pharmacies
  Overview --> Users
  Overview --> Catalogue
  Overview --> Safety
  Overview --> Growth
  Overview --> Platform

  Pharmacies --> VerifyQ[Verification queue]
  Pharmacies --> PharmRec[Pharmacy record]
  PharmRec --> Branches
  PharmRec --> Licences
  PharmRec --> Suspend[Suspend / reinstate]

  Users --> UserSearch[User search]
  UserSearch --> UserRec[User record]
  UserRec --> Impersonate[Consented support session]
  UserRec --> AccessHistory[Access history]

  Catalogue --> Medicines
  Catalogue --> Ingredients
  Catalogue --> Categories
  Catalogue --> Merge[Duplicate review]
  Catalogue --> Knowledge[Knowledge releases]

  Safety --> Claims[Clinical claims]
  Safety --> Alerts[Alert analytics]
  Safety --> Interactions[Interaction rules]
  Safety --> Incidents[Safety incidents]

  Growth --> Coverage[Coverage map]
  Growth --> FillRate[Request fill rate]
  Growth --> Cohorts
  Growth --> Funnels

  Platform --> Flags[Feature flags]
  Platform --> Releases[Release governance]
  Platform --> Broadcast[Notification broadcast]
  Platform --> Support[Support tickets]
  Platform --> Roles[Roles & permissions]
  Platform --> Audit[Audit log]
  Platform --> Config[System settings]
```

**Six top-level areas, not thirteen menu items.** Thirteen flat items is a
list, not an information architecture; the operator scans it every time
instead of learning it. The grouping is by *question being asked*: who supplies
(Pharmacies), who uses (Users), what do we know (Catalogue), is it safe
(Safety), is it working (Growth), how is it configured (Platform).

**Overview is a triage screen, not a vanity dashboard.** It answers: what is
broken, what is queued, what needs a human today.
