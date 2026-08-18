# Authentication Module

## Overview

The authentication module is responsible for public account registration, credential validation, access-token creation, and validation of authenticated requests. User profile management remains in the users module.

This refactor separates transport contracts, response models, mapping, and token concerns so that `AuthService` only coordinates authentication use cases.

## Module Structure

```text
src/modules/auth/
├── config/
│   └── auth.config.ts
├── dto/
│   ├── login.dto.ts
│   └── register.dto.ts
├── interfaces/
│   └── jwt-payload.interface.ts
├── mappers/
│   └── auth.mapper.ts
├── responses/
│   ├── auth.response.ts
│   └── authenticated-user.response.ts
├── services/
│   └── token.service.ts
├── strategies/
│   └── jwt.strategy.ts
├── auth.controller.ts
├── auth.module.ts
└── auth.service.ts
```

## Responsibilities

| Component | Responsibility |
|---|---|
| `AuthController` | Exposes the public register and login endpoints |
| `RegisterDto` and `LoginDto` | Validate and normalize incoming data |
| `AuthService` | Coordinates registration and credential validation |
| `TokenService` | Creates signed access tokens |
| `AuthMapper` | Builds JWT payloads and public response objects |
| `JwtStrategy` | Verifies tokens and loads the current user identity |
| Response classes | Define the data returned by authentication endpoints |

## API

### Register

`POST /auth/register`

Public registration supports only `consumer` and `vendor`. Administrative users must be created through an authorized administrative flow.

Consumer example:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword1!",
  "role": "consumer"
}
```

Vendor registration also requires `vendorProfile`, following the existing vendor profile contract.

### Login

`POST /auth/login`

```json
{
  "email": "user@example.com",
  "password": "StrongPassword1!"
}
```

Both endpoints return the same response shape:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "role": "consumer"
  }
}
```

Authenticated profile data is available from `GET /users/me`. The former `GET /auth/profile` endpoint was removed to avoid having two sources for the same resource.

## Token Design

The signed application payload contains only the user identifier:

```json
{
  "sub": "<user-id>"
}
```

Email and role are not trusted from long-lived token claims. For each protected request, `JwtStrategy` verifies the signature, expiration, issuer, audience, and `HS256` algorithm, then loads the current identity from the database. Consequently:

- deleted users lose access immediately;
- role changes take effect without waiting for the current token to expire;
- readable JWT claims do not expose email or role;
- authorization uses current server-side data.

The former `GET /auth/check-status` endpoint was removed. It issued a new access token from an existing access token and allowed indefinite renewal without re-authentication.

## Security Decisions

### Public role restriction

`RegisterDto` accepts only `consumer` and `vendor`. The broader `CreateUserDto` remains available to the admin-protected users flow, but it is no longer exposed directly by public registration.

### Email normalization

Login and public registration trim and lowercase email addresses before lookup or persistence. This reduces duplicate accounts and inconsistent login behavior caused by casing or surrounding whitespace.

Existing mixed-case email records should be normalized with a controlled data migration before deployment if the database already contains production users.

### Credential errors and timing

Login always returns `Invalid credentials` for an unknown email or incorrect password. When the email does not exist, the service performs a comparison against a fixed bcrypt hash so the two failure paths have a more similar computational cost.

Password complexity is validated during account creation and password changes. Login only requires a non-empty string, allowing existing credentials to be checked even if password rules evolve later.

### Typed authenticated user

The shared `AuthenticatedUser` interface replaces `any` in authenticated controllers and is also used by the `CurrentUser` decorator, mapper, strategy, and token service.

## Configuration

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `JWT_SECRET` | Yes | None | HMAC signing secret; minimum 32 characters |
| `JWT_EXPIRATION` | No | `24h` | Access-token lifetime |
| `JWT_ISSUER` | No | `muvia-api` | Token issuer checked during validation |
| `JWT_AUDIENCE` | No | `muvia-client` | Token audience checked during validation |

Token creation and validation consume the same centralized configuration from `auth.config.ts`.

## Compatibility Notes

Tokens generated before this change do not contain the new issuer and audience claims and will be rejected. Clients must log in again after deployment.

The following endpoints were removed:

- `GET /auth/profile`: use `GET /users/me` instead.
- `GET /auth/check-status`: log in again when the access token expires.

## Deferred Improvements

The following improvements require broader persistence or infrastructure decisions and are intentionally outside this module refactor:

- refresh-token rotation, revocation, and reuse detection;
- rate limiting for login and registration, ideally backed by shared storage in multi-instance deployments;
- transactional creation of users and vendor profiles in the users module;
- case-insensitive database uniqueness for normalized email addresses;
- focused unit and integration coverage for authentication flows.
