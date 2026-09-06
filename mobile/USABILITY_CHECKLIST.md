# First-borrow usability check

Status: prepared, not performed. Automated checks cannot prove a new neighbor
finds the app easy. Run this on the candidate iPhone build with synthetic items
and two consenting testers; do not use anyone's real inventory or address.

## New neighbor — no coaching

1. Start with a fresh unverified account and no friends. Finish onboarding.
   Ask: “What can people in town see about your belongings?” The answer should
   be “nothing unless I share an item,” not “everything once verified.”
2. Add a drill. Check that Only me is obvious, optional details are optional,
   and Save to my inventory feels different from publishing to town.
3. Leave an unfinished item/request, close and reopen the app. Confirm its draft
   returns, another account cannot see it, and Discard starts a fresh private form.
   Check cached photos after restarting; replace missing previews if necessary.
4. Ask for a ladder. With no friends, the explanation and invite/verify choices
   should make sense. A connection error must not imply there are zero friends.
   Never silently switch the audience to town to get around the warning.
5. Choose Today, This weekend, a date range and Flexible. Explain when the request
   disappears and find how to change that. Retry with an expired restored draft.

## Two-person exchange

6. From both Home and request detail, offer one inventory item privately. The
   requester should see that item, not the lender's remaining inventory.
7. Find the chat in Inbox without using Profile. Identify the item, dates, status
   and next action. With two simultaneous exchanges, select the correct item.
8. Owner approves; borrower confirms only after pickup. Return opens condition
   review; owner confirms receipt. A giveaway must not ask for a return.
9. Interrupt a message/photo send, reopen chat from Inbox and retry on the updated
   backend. It must create one server message, not two; newer composer text must
   remain intact. On the old backend, refresh/check instead of offering safe retry.
10. Force failed list refreshes, lost network, and unavailable draft storage.
    Verify helpful recovery text, preserved entries, and no false “saved” claim.

## Native layout and comprehension

- Small iPhone and larger accessibility text: long names, audience labels, dates,
  rank labels and action buttons must fit without truncating the essential action.
- Parchment surfaces and woodland icons remain legible; icons have text labels.
- Sheets have visible handles and Close; keyboard leaves composer/action buttons
  reachable; chat does not jump to the bottom while reading earlier messages.
- Verification is not described as a guarantee of safety. Ranks mean activity.
- Profile shows the installed native build, not a source config guess.

Record each task as unassisted / needed a hint / failed, with the tester's own
words and time-to-find. Treat confusion over who sees an item or a request as a
release blocker regardless of how attractive the screen looks. No results have
been recorded yet.
