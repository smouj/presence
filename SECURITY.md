# Security

## Report a vulnerability

Open a private security advisory on GitHub:
<https://github.com/smouj/presence/security/advisories/new>

Please do not open a public issue for a vulnerability.

## Design

- The server binds to `127.0.0.1` by default and has no authentication layer;
  do not expose it to the internet without putting an authenticating proxy in
  front of it.
- It performs no outbound writes. Collectors only issue GET requests to public
  APIs listed in the README.
- Credentials are never stored: automatic readers use public endpoints only.
- Configuration writes are validated, atomic and leave a backup.
