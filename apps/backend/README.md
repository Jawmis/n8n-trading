# backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

Passwords are stored as Argon2id hashes. Existing legacy plaintext records are
accepted only during a successful sign-in and are rehashed immediately; users
must use the current password policy when creating new accounts.

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
