Act as the integration lead reviewing HealthHub across `apps/api`, `apps/web`, and `apps/mobile`.

Read the project docs first. Inspect the actual repository; do not assume a file or feature exists because another agent said it does.

Review:
1. API request/response compatibility across both clients.
2. Authentication and session behavior.
3. Patient ownership, consent, role authorization, and QR access.
4. Prescription source/version/verification fields and correction behavior.
5. Upload validation, file storage privacy, PDF and QR behavior.
6. Medication schedule safety gates.
7. Appointment concurrency and cancellation.
8. Responsive/mobile usability and UI consistency.
9. Fake integrations, dead buttons, hardcoded success states, fabricated ratings/data.
10. Missing `.env.example`, migrations, seed instructions, error handling, tests, and README steps.

Run available commands where possible. Return:
- P0 blockers (security, data loss, broken core flow)
- P1 blockers (core MVP broken)
- P2 polish
- exact file/line references
- smallest safe fix for each issue
- commands run and real results
Do not rewrite the entire project. Fix one P0/P1 vertical slice at a time, and update the contract if required.
