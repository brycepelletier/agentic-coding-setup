# AUTONOMOUS LOGIC

## Test Prompt
<!-- AGENT-TEST:PROMPT:BEGIN -->
AUTONOMOUS LOGIC TEST
Do not use tools.
Do not ask the user any questions.
Do not request confirmation or clarification.
All information necessary to answer is contained below.
Fact: `Agentic Coding is a repository.`
Proposition A: `ZERO repositories may be modified during planning.`
Proposition B: `Agentic Coding MAY be modified during planning.`
Determine the answers yourself.
Output exactly two lines and nothing else:
`PAIR_COMPATIBLE=<YES|NO>`
`MY_ANSWER_CONTRADICTION=<YES|NO>`
`PAIR_COMPATIBLE` asks whether Propositions A and B can both be true at the same time.
`MY_ANSWER_CONTRADICTION` asks whether your answer to `PAIR_COMPATIBLE` itself contradicts Proposition A.
Do not ask for clarification.
<!-- AGENT-TEST:PROMPT:END -->

## Expected Result
<!-- AGENT-TEST:EXPECT:BEGIN -->
PAIR_COMPATIBLE=NO
MY_ANSWER_CONTRADICTION=NO
<!-- AGENT-TEST:EXPECT:END -->

## Evaluation
<!-- AGENT-TEST:EVALUATION:BEGIN -->
The response must satisfy the expected result above. Review every stated constraint and report discrepancies only.
<!-- AGENT-TEST:EVALUATION:END -->
