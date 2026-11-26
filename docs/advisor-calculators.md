# Advisor and Forecast calculators

(codex)

The signed-in Advisor can request a calculation through the model provider's
function-call response. The server validates tool names and input fields, runs
the existing calculators on the signed-in account's data and passes the result
to the verifier. A calculation renders in the final response as a table.
Historic results can be read in the thread. They cannot be pinned as live Home
widgets.

Forecast can reuse the authenticated `POST /api/v1/calculators/:name` endpoint.
It accepts the inputs below and returns `{ result, widget }` on success.

| Name | JSON input |
| --- | --- |
| `tax_brackets` | Empty object |
| `super_tax_scenario` | `additionalContribution` in AUD |
| `debt_payoff` | Optional `strategy` (`avalanche` or `snowball`) and `extraMonthlyPayment` in AUD |
| `growth_scenario` | `years` as an integer, `annualReturnPercent` as a percentage and optional `monthlyContribution` in AUD |

The server supplies the profile and debt data. A caller cannot submit an
account identifier. Missing profile or debt data returns a 422 response when
that information is needed. Invalid input returns 400 and an unknown
calculator returns 404. The Advisor uses the same calculation module and
shows the assumptions alongside each result.

The Forecast route and presentation remain with the redesign work.
