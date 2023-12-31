# fensak-io/reng - Fensak Rules Engine

<p align="center">
  <a href="https://www.npmjs.com/package/@fensak-io/reng">
    <img alt="NPM" src="https://img.shields.io/npm/v/@fensak-io/reng.svg?style=for-the-badge">
  </a>
  <a href="https://github.com/fensak-io/reng/releases/latest">
    <img alt="latest release" src="https://img.shields.io/github/v/release/fensak-io/reng?style=for-the-badge">
  </a>
  <br/>
  <a href="https://github.com/fensak-io/reng/actions/workflows/lint-test-release.yml?query=branch%3Amain">
    <img alt="main branch CI" src="https://img.shields.io/github/actions/workflow/status/fensak-io/reng/lint-test-release.yml?branch=main&logo=github&label=CI&style=for-the-badge">
  </a>
  <a href="https://docs.fensak.io/docs/writing-rules/">
    <img alt="Documentation" src="https://img.shields.io/badge/docs-docs.fensak.io-blue?style=for-the-badge">
  </a>
  <a href="https://github.com/fensak-io/reng/blob/main/LICENSE">
    <img alt="LICENSE" src="https://img.shields.io/badge/LICENSE-AGPL_3.0_OR_BUSL_1.1-orange?style=for-the-badge">
  </a>
</p>

This is the source code for the [Fensak](https://fensak.io) Rules Engine which drives execution of user defined rules on
the Fensak platform.


## Using @fensak-io/reng for testing Fensak rules

Refer to the [Testing your rule functions](https://docs.fensak.io/docs/writing-rules/#testing-your-rule-functions)
section in our [Writing rules scripts guide](https://docs.fensak.io/docs/writing-rules/) for an overview of how to use
this package for testing rule functions.


## Reporting Bugs, Getting Help, Providing Feedback, etc

Please [create a GitHub discussion](https://github.com/orgs/fensak-io/discussions/new/choose) if you want to:
- report issues with **the hosted Fensak service**
- get any kind of help, like setting up Fensak, writing custom rules, or using Fensak in general
- provide product feedback and suggestions

Please [create a GitHub issue](https://github.com/fensak-io/reng/issues/new/choose) to report bugs and issues with
**the reng library**, including self-hosting and using the functions for testing.

**Do not open an issue to report security issues**. Instead, please review our [Security
Policy](https://github.com/fensak-io/reng/security/policy).

If you are a paying customer of our GitHub App, and have questions about your account, or have any kind of billing
releated inquiry, please email [support@fensak.io](mailto:support@fensak.io).


## LICENSE

`SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1`

`reng` is dual-licensed under the [AGPL 3.0](https://www.gnu.org/licenses/agpl-3.0.en.html) (or any later version) and
[Business Source License 1.1](https://mariadb.com/bsl-faq-adopting/) (with no Additional Use Grant). Refer to the
corresponding LICENSE files for the full parameters of either license:

- [LICENSE.AGPL-3.0-or-later](/LICENSE.AGPL-3.0-or-later)
- [LICENSE.BUSL-1.1](/LICENSE.BUSL-1.1)

Dual licensing means that you can use the code under the terms of **either** license.

For example, if you are using this to test your rules functions and you do not want to be bound by the terms of the AGPL
license (and thus be forced to release the source code of your rules), you can license the `reng` code under the BUSL
1.1 license.

On the other hand, if you wish to use `reng` in an internal-use only or open source service, then you can license `reng`
under the terms of the AGPL 3.0 (or later) license. You can not use `reng` in this manner under the BUSL 1.1 license
since it does not allow any additional use grant for production usage.

Refer to the [License FAQ](https://docs.fensak.io/docs/license-faq/) for more information.
