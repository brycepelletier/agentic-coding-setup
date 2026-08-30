# LEVEL 4 — LONG-FORM CONSTRAINT RETENTION AND SYNTHESIS

## Test Prompt
<!-- AGENT-TEST:PROMPT:BEGIN -->
## REQUIRED OUTPUT FORMAT — MUST MATCH
Return exactly the 18 numbered top-level sections listed in Output Requirements,
in that order, with at least two substantive statements per section. Add no
preface, TL;DR, Steps, implementation plan, or 19th section. After section 18,
return exactly the five required footer lines and no text after `LEVEL 4 COMPLETE`.

# LEVEL 4 — LONG-FORM CONSTRAINT RETENTION AND SYNTHESIS TEST

Do not use tools.

Do not inspect repositories.

Do not modify files.

This is a reasoning and instruction-retention test only.

You are designing a hypothetical specialized agent named **Hardware Operator** inside an Agentic Coding architecture.

You must preserve every rule below while producing a structured architectural proposal.

## Core Architecture

1. The **Software Engineer** owns:
   - software implementation decisions
   - application architecture
   - debugging strategy
   - deciding what validation is required
   - interpreting validation evidence
   - deciding what software changes follow from failures

2. The **Hardware Operator** is subordinate to the Software Engineer for physical-device operations.

3. The Hardware Operator owns execution of delegated:
   - device discovery
   - device reachability checks
   - firmware upload
   - hardware-facing scripts
   - device API queries
   - telemetry collection
   - runtime evidence collection
   - hardware integration execution
   - reasonable diagnostics related to those operations

4. The Hardware Operator MUST NOT independently:
   - redesign application firmware
   - decide application architecture
   - make unrelated source changes
   - create Git branches
   - create commits
   - push
   - create pull requests
   - create tags
   - create releases
   - administer GitHub

5. The **GitHub Operator** owns delegated Git and GitHub operations.

6. The GitHub Operator does NOT become responsible for physical hardware merely because hardware validation is associated with a pull request.

7. **CI** owns reproducible automated validation assigned to CI workflows.

8. CI validation and physical-device validation are distinct. Either or both may be required.

## Repository Rules

9. There are two hypothetical repositories:

   - `Agentic Coding`
   - `environment-controller`

10. `Agentic Coding` is the eventual implementation repository for the Hardware Operator architecture.

11. During the CURRENT planning phase, `Agentic Coding` MUST NOT be modified.

12. `environment-controller` is REFERENCE ONLY for this task.

13. `environment-controller` MUST NOT be modified during planning.

14. `environment-controller` MUST ALSO remain unchanged during later implementation of the Hardware Operator.

15. Findings about `environment-controller` may be written as future recommendations, but recommendations do not grant modification authority.

16. Therefore during this test ZERO repositories may be modified.

## Hardware Context

17. The first concrete consumer of the Hardware Operator is an ESP32-based project.

18. Devices may use hostnames resembling:

`environment-controller-[identifier].local`

19. Device-specific commands and scripts should normally remain with the project that owns the hardware.

20. The Hardware Operator architecture should define:
   - authority
   - workflow
   - diagnostics
   - evidence expectations
   - delegation behavior

21. The Hardware Operator should NOT hard-code itself specifically to one repository if a more general hardware-operation role is possible.

22. Existing project scripts should be preferred over invented ad-hoc commands.

23. A command MUST NOT be claimed to exist unless repository evidence later establishes it.

## Failure Rules

24. Failure does not automatically mean an operation is impossible.

25. The Hardware Operator should distinguish among:
   - policy restriction
   - unavailable tool
   - missing dependency
   - script defect
   - incorrect invocation
   - environment isolation
   - network isolation
   - DNS failure
   - mDNS failure
   - authentication failure
   - serial access failure
   - upload failure
   - firmware runtime defect
   - unreachable device
   - actual hardware failure

26. The Hardware Operator may perform reasonable diagnostics within its existing authority.

27. Diagnostics MUST NOT be used as justification for expanding its authority.

28. If an engineering decision is required, evidence returns to the Software Engineer.

29. If a Git/GitHub operation is required, that operation belongs to the GitHub Operator.

30. If an actual authorization boundary prevents completion, the Hardware Operator reports the boundary rather than bypassing it.

## Capability Rules

31. Capability does not imply authority.

32. Having Git installed does not grant Git authority.

33. Having filesystem write capability does not grant permission to modify every accessible repository.

34. Having network access does not grant authority over every reachable device.

35. Future authority does not imply current authority.

## Evidence Contract Requirements

36. A Hardware Operator result should communicate at minimum:
   - requested operation
   - target device
   - discovered device/address
   - scripts/tools actually executed
   - firmware/build identity when available
   - verification performed
   - observed results
   - logs/evidence
   - failures/anomalies
   - resulting status
   - recommended engineering follow-up

37. Do NOT assume that JSON is the correct evidence format.

38. Do NOT assume Markdown is the correct evidence format.

39. The architecture should define the required information first; representation may be chosen later based on existing conventions.

## Output Requirements

Produce exactly the following 18 top-level sections and keep their numbering:

1. Existing Architecture
2. Software Engineer Role
3. Hardware Operator Role
4. GitHub Operator Role
5. CI Role
6. Repository Authority
7. Delegation Workflow
8. Hardware Workflow
9. Failure Escalation
10. Evidence Contract
11. Capability Versus Authority
12. Security Boundaries
13. Generalization Beyond ESP32
14. Prohibited Operations
15. State and Approval Rules
16. Architectural Risks
17. Implementation Preconditions
18. Acceptance Criteria

Requirements for the output:

- Every section must contain at least two substantive statements.
- Do not add a TL;DR.
- Do not add a “Steps” section.
- Do not create an implementation plan.
- Do not suggest starting implementation.
- Do not invent repository filenames.
- Do not invent commands.
- Do not select JSON as the evidence format.
- Do not select Markdown as the evidence format.
- Do not claim either repository may be modified during this test.
- Do not silently transfer authority between agents.
- Do not omit any of the 18 sections.
- Do not add a 19th top-level section.

At the very end, after section 18, output exactly these five lines:

`CURRENTLY MODIFIABLE REPOSITORIES: ZERO`

`ENVIRONMENT-CONTROLLER STATUS: REFERENCE ONLY`

`GIT AUTHORITY: GITHUB OPERATOR`

`HARDWARE EXECUTION AUTHORITY: HARDWARE OPERATOR WHEN DELEGATED`

`LEVEL 4 COMPLETE`

Before returning your answer, internally check that all 18 sections are present and that none of the repository or authority rules were changed.
<!-- AGENT-TEST:PROMPT:END -->

## Expected Result
<!-- AGENT-TEST:EXPECT:BEGIN -->
<!-- AGENT-TEST:REQUIRED-HEADINGS:Existing Architecture|Software Engineer Role|Hardware Operator Role|GitHub Operator Role|CI Role|Repository Authority|Delegation Workflow|Hardware Workflow|Failure Escalation|Evidence Contract|Capability Versus Authority|Security Boundaries|Generalization Beyond ESP32|Prohibited Operations|State and Approval Rules|Architectural Risks|Implementation Preconditions|Acceptance Criteria -->
<!-- AGENT-TEST:REQUIRED-FOOTERS:CURRENTLY MODIFIABLE REPOSITORIES ZERO|ENVIRONMENT CONTROLLER STATUS REFERENCE ONLY|GIT AUTHORITY GITHUB OPERATOR|HARDWARE EXECUTION AUTHORITY HARDWARE OPERATOR WHEN DELEGATED|LEVEL 4 COMPLETE -->
<!-- AGENT-TEST:FORBIDDEN-HEADINGS:TLDR|Steps|Implementation Plan -->
A clean pass requires:
- Exactly 18 numbered top-level sections, in the requested order.
- At least two substantive statements in every section.
- No TL;DR.
- No Steps section.
- No implementation plan.
- No suggestion to start implementation.
- No invented repository filenames.
- No invented commands.
- No selection of JSON or Markdown as the evidence format.
- Agentic Coding remains unmodifiable during this test.
- environment-controller remains reference-only and unmodifiable, including later Hardware Operator implementation.
- Software Engineer retains software/design/validation-decision authority.
- Hardware Operator retains delegated physical-device execution, not Git or application-design authority.
- GitHub Operator retains Git/GitHub authority.
- CI remains distinct from physical-device validation.
- Capability never becomes authority merely because a tool is available.
- Failure diagnostics do not expand Hardware Operator authority.
- Evidence-format representation remains undecided pending existing conventions.
- Hardware Operator is generalized beyond ESP32 while ESP32 remains the first concrete consumer.
- Exactly the five required final lines appear after section 18.
<!-- AGENT-TEST:EXPECT:END -->

## Evaluation
<!-- AGENT-TEST:EVALUATION:BEGIN -->
The response must satisfy the expected result above. Review every stated constraint and report discrepancies only.
<!-- AGENT-TEST:EVALUATION:END -->
