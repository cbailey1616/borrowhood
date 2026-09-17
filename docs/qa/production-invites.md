# Production invitations

Friends and onboarding share a personal HTTPS profile link. It opens the profile in the installed app; the recipient chooses whether to send a friend request. The sender still accepts the request. Sharing only opens the system composer or share sheet and does not send a message or create a friendship.

Without the app, the link opens a landing page with the production App Store listing (`6758581435`). After installation and signup, recipients must tap the original invite again or rescan the QR code. There is no deferred deep-link service. Links opened in an installed app are retained through sign-in and onboarding in the current session.

Neighborhood invitations use that same App Store listing and tell the recipient the neighborhood name to find and request to join. They do not grant membership automatically.

Before public launch:

- Deploy the profile landing page and Apple association route to the production API. TestFlight upload does not deploy these routes.
- Make the App Store listing publicly available. The public download is not available merely because a build is in TestFlight.
- On an iPhone with the app installed, tap a shared profile link and check the intended profile opens after any required sign-in.
- On an iPhone without the app, check the landing page, install from the App Store after release, sign up, and reopen the invite. Send and accept a friend request explicitly.
- Check a neighborhood invitation contains the right name and joining follows the existing membership rules.

Automated coverage checks production App Store IDs against EAS configuration, profile link routing through authentication, composer cancellation, and no automatic friend request on sharing.
