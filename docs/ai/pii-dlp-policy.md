# PII and DLP policy

The local DLP gateway is fail-closed. It normalizes NFKC text, translates Devanagari digits for
detection, identifies invisible/bidi controls, and applies critical structured recognizers before any
external path.

Blocked categories include Aadhaar, PAN, Indian mobile numbers, OTPs, learner/driving licences,
application and receipt references, UPI, IFSC, bank accounts, passport, voter ID, vehicle
registration, email, and disclosure-context names/addresses.

When PII is detected:

- no provider adapter is invoked;
- raw spans are replaced only in transient memory;
- local intent routing may produce general privacy-safe guidance;
- no anonymization vault or deanonymization store is created.

The provider interface accepts `CanonicalProviderRequest`, which has no raw-question field. Provider
payload DLP and outbound response DLP remain mandatory even after inbound DLP succeeds. DLP failures,
timeouts, model initialization failures, and exception paths fail closed and expose only sanitized
errors.
