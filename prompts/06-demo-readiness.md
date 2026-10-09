Prepare HealthHub for a demo on 21 October 2026.

Inspect the actual repository and test the product from a clean start. Do not claim a workflow works unless you ran it.

Verify:
- documented clean-install steps
- environment variables are documented without secrets
- database migrations and seed script work
- API starts and health endpoint responds
- web starts and builds
- mobile app starts
- patient profile creation
- prescription upload -> extraction fixture -> review/correction -> persisted record -> PDF/QR
- protected access denies unauthorized users
- medication schedule behavior for incomplete/uncertain fields
- hospital directory and admin authorization
- appointment booking and double-booking protection
- loading/error/empty states
- no fake payment success or real wallet balance
- no real patient data or secrets in repository
- README screenshots/demo instructions accurately describe the product

Return a release checklist with pass/fail/blocked, commands and evidence. Fix P0 and P1 issues only, keeping `main` runnable. Clearly list any feature that is a mock, disabled, or not production-ready.
