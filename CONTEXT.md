# HelloMaal wealth platform

HelloMaal maintains a trustworthy household wealth record and allows calculations and approved
services to operate on an explicitly consented snapshot of that record.

## Wealth records

**Financial account**:
A container held with an institution or provider, such as a bank, brokerage, super or loan account.
_Avoid_: Asset, connection

**Holding**:
A quantity of a specific instrument owned inside a financial account at a point in time.
_Avoid_: Investment account, stock account

**Asset**:
Something of financial value owned wholly or partly by a person or household; it may exist without a financial account.
_Avoid_: Holding, account

**Valuation**:
A sourced estimate or observation of an asset's value at a stated time and in a stated currency.
_Avoid_: Balance, price

**Provider connection**:
The consented technical relationship that permits HelloMaal to exchange scoped data with a provider.
_Avoid_: Account, plugin

## Services

**Service integration**:
An approved, versioned workflow that uses a consented wealth snapshot to produce a recorded result.
_Avoid_: Plugin, tool, app

**Service run**:
An immutable record of a service's inputs, methodology, result, warnings and evidence.
_Avoid_: Chat answer, live result

**Marketplace listing**:
A disclosed product or partner listing that may lead a user to an external provider but cannot alter the wealth record.
_Avoid_: Recommendation, plugin
