# Security policy

## Supported versions

Security fixes are applied to the current version of this package.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository.

Enable **Private vulnerability reporting** in the repository security settings if it is not already on. That is the contact path for this project. Do not open a public issue for an unfixed vulnerability.

Include the version or git revision, the affected command or file, and a description that lets a maintainer reproduce the issue. Leave out live tokens, private keys, and authorization headers.

Please give the maintainers time to investigate and publish a fix before disclosing the report publicly.

## Repository protections

This repository is set up for:

- `npm audit` at high and critical severity
- GitHub Dependency Review on pull requests
- CodeQL for JavaScript and TypeScript, including a weekly scan
- npm provenance on tagged releases

Also enable GitHub secret scanning and push protection in the repository security settings.
