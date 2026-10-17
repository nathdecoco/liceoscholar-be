# LiceoSCholar — Backend API

REST API for the LiceoSCholar scholarship portal (Liceo de Cagayan University).
Built with **Node.js + TypeScript + Express + MongoDB (Atlas)**.

The Angular frontend lives in a separate repository and talks to this API over
HTTP, sending a JSON Web Token on every authenticated request.

---

## Requirements

- Node.js 20+ (developed on Node 22)
- A MongoDB Atlas cluster (free tier is fine)

## Getting started

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# then paste your Atlas connection string into MONGODB_URI
npm run dev
```

The API starts on `http://localhost:4000`. On the first run it seeds an
administrator account and four demo students (see *Seeded accounts* below).

### Running without Atlas

`tests/serve-memory.ts` boots the API against an in-memory MongoDB and is handy
for local development:

```bash
npx tsx tests/serve-memory.ts
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with hot reload (`tsx watch`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Type-check without emitting |
| `npm run seed` | Re-seed the administrator and demo students |
| `npm test` | End-to-end API tests (uses an in-memory MongoDB) |

## Seeded accounts

| Role | Login | Password |
| --- | --- | --- |
| Administrator | `authorizedadminscholar` | `AdminScholar2026` |
| Student (example) | `christy.reyes@liceo.edu.ph` | `Scholar123` |

All four seeded students share the `SEED_STUDENT_PASSWORD`. Change the
passwords (and `JWT_SECRET`) before deploying by editing `.env`.

## API reference

All request and response bodies are JSON. Authenticated routes expect
`Authorization: Bearer <token>`.

### Auth — `/api/auth`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/register` | Create an unverified student account |
| `POST` | `/verify-email` | Confirm a signup and receive a token |
| `POST` | `/login` | Sign in with an email (student) or username (admin) |
| `GET` | `/me` | Current account |

### Current account — `/api/me`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Account + (for students) requirements |
| `PATCH` | `/` | Update `fullName`, `age`, `sex`, `suffix` |
| `POST` | `/photo` | Upload a profile picture (`multipart`, field `photo`) |
| `POST` | `/requirements/:id/file` | Upload a requirement file (students) |
| `DELETE` | `/requirements/:id/file` | Remove a requirement file (students) |

### Students — `/api/students` *(administrator only)*

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | List students (`search`, `status`, `scholarshipType`, `course`, `yearLevel`) |
| `GET` | `/:id` | Student profile + requirements |
| `PATCH` | `/:id` | Update a student's record (mainly `status`) |

### Requirements — `/api/requirements` *(administrator only)*

| Method | Path | Description |
| --- | --- | --- |
| `PATCH` | `/:id` | Set a requirement's `status` (`Pending`, `Approved`, `Disapproved`) |

### Other

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health probe |
| `GET` | `/uploads/:file` | Served uploaded files |

## Project layout

```
src/
  config/env.ts          Environment configuration
  models/                Mongoose schemas (User, Requirement)
  middleware/            Auth, error handling, file uploads
  routes/                auth / me / students / requirements routers
  db/                    Connection + seed data
  utils/                 JWT, passwords, serialization, validation
  app.ts                 Express app factory
  index.ts               Server bootstrap
tests/                   API tests + in-memory dev server
```

Uploaded files are written to `UPLOAD_DIR` (default `uploads/`) and are ignored
by Git.
