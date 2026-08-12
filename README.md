Rocket.Chat PhotoDNA Scanning App
=================================

[![CI](https://github.com/c4osl/rocketchatcsam/actions/workflows/ci.yml/badge.svg)](https://github.com/c4osl/rocketchatcsam/actions/workflows/ci.yml)
[![ESLint](https://img.shields.io/badge/lint-eslint-4B32C3?logo=eslint&logoColor=white)](eslint.config.js)
[![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4?logo=prettier&logoColor=white)](prettier.config.js)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This [Rocket.Chat App](https://developer.rocket.chat/docs/rocketchat-apps-engine) validates uploaded images against the [Microsoft PhotoDNA cloud service](https://www.microsoft.com/en-us/photodna), moves them to a quarantine channel or deletes them before they are shown, and, when configured to do so, reports each match to the National Center for Missing and Exploited Children (NCMEC).

For installation, configuration, testing, and troubleshooting instructions, see the [wiki](https://github.com/c4osl/rocketchatcsam/wiki).

Acknowledgements
================

This app was originally developed under Prostasia Foundation, which has since ceased operations. This project continues to be supported by the [Center for Online Safety and Liberty (COSL)](https://c4osl.org/), which also funded Prostasia. If you'd like to support COSL's work, see their [Support Us](https://c4osl.org/support-us/) page.

Changelog
=========

- 0.2.0
    - Allow to limit analysis to specific rooms
- 0.2.1
    - Optimistic removal of `Converting circular structure to JSON`
- 0.2.2
    - Limit analysis to room names setting is now case-insensitive
    - Fix `Converting circular structure to JSON` bug
- 0.2.3
    - Added information about CSAM prevention resources
- 0.3.0
    - Added automated report functionality (configurable)
- 0.3.1
    - Patched minimatch from 3.0.4 to 3.1.2 to mitigate security vulnerability
- 0.3.2
    - Fix `Invalid or missing request parameter(s)` bug
- 0.3.3
    - Implemented setting to watch all direct rooms (DMs)
- 0.3.4
    - Modernized tooling: updated @types/node and typescript to current versions, migrated linting from tslint to eslint
    - Upgraded @rocket.chat/apps-engine from ^1.19.0 to ^1.64.1, resolving all npm audit vulnerabilities
    - Restructured source files into config/ and lib/ folders. No behavior changes
- 0.4.0
    - Added a unit test suite and a live-API integration test
    - Added `/photodna-test-connection` slash command to verify the API key and connectivity from within Rocket.Chat
    - Fixed matched image bytes being written into application logs
    - Fixed fail-open behavior when PhotoDNA API calls fail or return an unusable response
    - Fixed only the first message attachment being scanned
    - Fixed unsupported image formats being treated as a special warned-about case instead of ordinary filtering
    - Fixed the NCMEC test-mode setting being a no-op
    - Fixed the upload ID being derived by parsing the attachment URL instead of using its `fileId`
    - Fixed the quarantine channel being resolved by name on every match, which broke on rename
    - Added error handling around the PhotoDNA and NCMEC API calls
    - Added automated CI via GitHub Actions
    - Moved installation, configuration, testing, and troubleshooting docs to the wiki
- 0.4.1
    - Fixed `rc-apps package`/`deploy` failing due to a bug in `@rocket.chat/apps-compiler`
    - Fixed `requiredApiVersion` drifting to a stricter minimum than the app needs
    - Renamed the app to PhotoDNA Scanning App
    - Updated stale author info
    - Adopted Prettier for code formatting
