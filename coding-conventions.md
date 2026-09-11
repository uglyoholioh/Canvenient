# Coding Conventions and Practices

This project follows a small set of coding conventions to keep the codebase readable, consistent, and easy to review.

## General Practices
- Work on one feature per branch.
- Use pull requests for all merges into `main`.
- Keep commits small and meaningful.
- Do not commit secrets, API keys, or `.env` files.
- Update the README and issue tracker as features are completed.

## Backend Conventions (FastAPI / Python)
- Use `ruff` for linting and import ordering (enforced in CI; see `backend/pyproject.toml`).
- Install exact dependency versions from `requirements-lock.txt`; bump floors in `requirements.txt` only deliberately.
- Follow PEP 8 naming conventions.
- Use `snake_case` for variables, functions, and file names.
- Keep routes, schemas, and utility functions in separate files when possible.
- Validate request data using Pydantic models.
- Hash passwords with bcrypt and never store plaintext passwords.

## Frontend Conventions (React / JavaScript)
- Use `eslint` for linting (`npm run lint` runs with zero warnings allowed in CI).
- Prefer design-system tokens (`--accent`, `--surface`, `--text-muted`, ...) over hardcoded colors.
- Use `prettier` for formatting.
- Use `camelCase` for variables and functions.
- Use clear component names in `PascalCase`.
- Keep components focused on one responsibility.
- Place reusable API calls and helpers in separate files.
- Show user-friendly loading and error states for API requests.

## Git and Workflow Conventions
- Pull the latest changes from `main` before starting work.
- Create a new branch for each feature or fix.
- Example branch names:
  - `feature/user-auth`
  - `feature/login-page`
  - `fix/login-validation`
  - `docs/readme-update`
- Use commit messages with a clear prefix:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `test:` for tests
  - `chore:` for maintenance
- Open a pull request when the branch is ready.
- Request review before merging into `main`.

## Testing Expectations
- Add backend tests for important API routes.
- Add frontend tests for key form or UI behaviour when needed.
- Run tests before opening a pull request.
- Fix linting and formatting issues before merging.

## Documentation Expectations
- Keep feature descriptions short and clear.
- Record implementation notes, challenges, and design choices in the README.
- Update documentation as the project changes, not only at the end.

## State Management (Frontend)
- Use `zustand` for managing global client state.
- Avoid prop-drilling for state that is needed across disparate components.

## Error Tracking
- Use Sentry (`@sentry/react` for frontend, `sentry-sdk` for backend) for error logging and monitoring in production.
- Ensure all critical exceptions that would otherwise fail silently are reported.

## Accessibility (a11y)
- Write semantic HTML for components.
- Use proper ARIA labels and roles for interactive elements, especially custom ones.
- Ensure all views are keyboard navigable (tab index, focus states).

## Version Control Rule
- Nothing goes directly into `main`.
- All changes should go through a branch and pull request.
