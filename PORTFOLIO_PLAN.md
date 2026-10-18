# Anas Manar — software engineering portfolio plan

## Positioning

Start with junior full-stack roles as the working direction. Adjust if the job descriptions you choose emphasize Java, .NET, mobile or another stack. Your software engineering degree, database internship and Nordec product experience give you relevant stories to support the code.

Use three complementary projects with visible engineering evidence. A personal portfolio website will help present them once the first project has substance.

| Project | Problem | Engineering evidence | Scope |
| --- | --- | --- | --- |
| NordecOps | Teams and clients need organized work and reporting | Real workflows, relational modeling, role checks, Supabase policies, tests | Extend your existing code after reviewing its current state; use synthetic client data in a public demo |
| Slotwise | Two users must not book the same space at once | Transactions, concurrency tests, APIs, retry safety, timezone handling | Start here; local TypeScript/SQLite core is implemented |
| BriefLens | Teams need answers grounded in their own documents | Document ingestion, retrieval, citations, access filtering, evaluation | Build later; start with retrieval before adding model-generated answers |

## Evidence to include for each completed project

- Clear README: what it solves, how to run it, architecture, tradeoffs and current limits.
- A working demo or short video using safe, synthetic data.
- Tests that demonstrate important failure cases.
- A GitHub history of your actual changes, with meaningful commit messages.
- A short case study: one hard problem, your decision, validation and the remaining tradeoff.
- CV bullets about implemented behavior; performance claims only after measuring them.

## VS Code and GitHub workflow

1. Open one project folder in VS Code.
2. Run the project and tests locally.
3. Understand the first feature and make a small change together.
4. Review the diff before committing.
5. Commit a coherent unit of work and push it to your own repository.
6. Add CI when the dependency setup is reproducible.

Suggested local initial commands after extracting the starter:

```bash
cd slotwise
git init
git add .
git commit -m "Add initial booking service and concurrency tests"
git branch -M main
```

Create a GitHub repository called `slotwise` without an initial README, licence or gitignore. Copy its HTTPS URL from GitHub, then substitute it below:

```bash
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

Do not paste a password, access token or secret into chat. Authenticate through your normal GitHub workflow on your computer.

## First session together

Run `node --version`, `npm --version` and `git --version` in the VS Code terminal. Share those outputs, then run `npm start` inside this folder. We will read `src/store.ts`, trace a reservation through the API and add rescheduling with a failure-case test.

The goal is to show work you can reason about under interview questions. Project completion strengthens the application; interview fundamentals and role-specific preparation remain separate work.
