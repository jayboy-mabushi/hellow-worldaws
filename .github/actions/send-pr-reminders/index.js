// // Import required modules from GitHub Actions toolkit
// const core = require("@actions/core");
// const github = require("@actions/github");

// // Main function to run the action
// async function run() {
//   try {
//     // Get the GitHub token from the input
//     const octokit = github.getOctokit(core.getInput("github_token"));
//     // Get the reminder message from the input
//     const reminderMessage = core.getInput("reminder_message");
//     // Get the review turnaround time in hours from the input and parse it as an integer
//     const reviewTurnaroundHours = parseInt(core.getInput("review_turnaround_hours"), 10);

//     // List all open pull requests in the repository
//     const { data: pullRequests } = await octokit.rest.pulls.list({
//       ...github.context.repo,
//       state: "open",
//     });

//     // Loop through each pull request
//     for (const pr of pullRequests) {
//       // Log the title of the pull request
//       core.info(`PR title: ${pr.title}`);

//       // Fetch detailed information about the pull request
//       const pullRequestResponse = await octokit.graphql(
//         `
//         query($owner: String!, $name: String!, $number: Int!) {
//           repository(owner: $owner, name: $name) {
//             pullRequest(number: $number) {
//               timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_COMMIT]) {
//                 nodes {
//                   __typename
//                   ... on ReviewRequestedEvent {
//                     createdAt
//                   }
//                   ... on PullRequestCommit {
//                     commit {
//                       committedDate
//                     }
//                   }
//                 }
//               }
//               reviews(first: 50, states: [APPROVED, CHANGES_REQUESTED, COMMENTED]) {
//                 nodes {
//                   createdAt
//                   author {
//                     login
//                   }
//                 }
//               }
//               comments(first: 100) {
//                 nodes {
//                   body
//                   createdAt
//                   author {
//                     login
//                   }
//                 }
//               }
//             }
//           }
//         }
//         `,
//         {
//           owner: github.context.repo.owner, // Repository owner
//           name: github.context.repo.repo,  // Repository name
//           number: pr.number,               // Pull request number
//         }
//       );

//       // Filter review request events from the timeline
//       const reviewRequestEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
//         (node) => node.__typename === "ReviewRequestedEvent"
//       );

//       // Filter commit events from the timeline
//       const commitEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
//         (node) => node.__typename === "PullRequestCommit"
//       );

//       // Get the latest event time from review requests and commits
//       const latestEventTime = new Date(
//         Math.max(
//           ...reviewRequestEvents.map(event => new Date(event.createdAt).getTime()),
//           ...commitEvents.map(event => new Date(event.commit.committedDate).getTime())
//         )
//       );

//       // Combine reviews and comments into a single array
//       const reviewsAndComments = [
//         ...pullRequestResponse.repository.pullRequest.reviews.nodes,
//         ...pullRequestResponse.repository.pullRequest.comments.nodes
//       ];

//       // Filter reviews and comments to only include those after the latest event time
//       const reviewsAndCommentsAfterLatestEvent = reviewsAndComments.filter(
//         (item) => new Date(item.createdAt) > latestEventTime
//       );

//       // Get the usernames of reviewers who have reviewed or commented
//       const reviewersWhoReviewedOrCommented = reviewsAndCommentsAfterLatestEvent.map(
//         (item) => item.author.login
//       );

//       // Get detailed information about the pull request
//       const { data: pullRequest } = await octokit.rest.pulls.get({
//         ...github.context.repo,
//         pull_number: pr.number,
//       });

//       // Filter requested reviewers to only include those who have not reviewed or commented
//       const reviewersToRemind = pullRequest.requested_reviewers.filter(
//         (rr) => !reviewersWhoReviewedOrCommented.includes(rr.login)
//       );

//       // If there are no reviewers to remind, continue to the next pull request
//       if (reviewersToRemind.length === 0) {
//         continue;
//       }

//       // Calculate the current time and the review by time based on the latest event
//       const currentTime = new Date().getTime();
//       const reviewByTime = latestEventTime.getTime() + 1000 * 60 * 60 * reviewTurnaroundHours;

//       // Log the current time and review by time for debugging
//       core.info(`currentTime: ${currentTime} reviewByTime: ${reviewByTime}`);
//       // If the current time is less than the review by time, continue to the next pull request
//       if (currentTime < reviewByTime) {
//         continue;
//       }

//       // Filter reminder comments to only include those with the reminder message
//       const reminderComments = pullRequestResponse.repository.pullRequest.comments.nodes.filter(
//         (node) => node.body.includes(reminderMessage)
//       );

//       // Get the most recent reminder comment, if any
//       const mostRecentReminderComment = reminderComments.length > 0
//         ? new Date(reminderComments[0].createdAt)
//         : null;

//       // If the most recent reminder comment is within the review turnaround time, continue to the next pull request
//       if (mostRecentReminderComment && mostRecentReminderComment.getTime() + 1000 * 60 * 60 * reviewTurnaroundHours > currentTime) {
//         continue;
//       }

//       // Format the reviewers to remind as a list of GitHub usernames
//       const reviewers = reviewersToRemind.map((rr) => `@${rr.login}`).join(", ");
//       // Create the reminder comment
//       const addReminderComment = `${reviewers} \n${reminderMessage}`;

//       // Post the reminder comment to the pull request
//       await octokit.rest.issues.createComment({
//         ...github.context.repo,
//         issue_number: pullRequest.number,
//         body: addReminderComment,
//       });

//       // Log the creation of the reminder comment
//       core.info(`Created comment on issue_number: ${pullRequest.number} body: ${addReminderComment}`);
//     }
//   } catch (error) {
//     // If there is an error, set the action to failed and log the error message
//     core.setFailed(error.message);
//   }
// }

// // Run the main function
// run();

// Import required modules from GitHub Actions toolkit
const core = require("@actions/core");
const github = require("@actions/github");

// Main function to run the action
async function run() {
  try {
    // Get the GitHub token from the input
    const octokit = github.getOctokit(core.getInput("github_token"));
    // Get the reminder message from the input
    const reminderMessage = core.getInput("reminder_message");
    // Get the review turnaround time in hours from the input and parse it as an integer
    const reviewTurnaroundHours = parseInt(core.getInput("review_turnaround_hours"), 10);

    // List all open pull requests in the repository
    const { data: pullRequests } = await octokit.rest.pulls.list({
      ...github.context.repo,
      state: "open",
    });

    // Loop through each pull request
    for (const pr of pullRequests) {
      // Log the title of the pull request
      core.info(`PR title: ${pr.title}`);

      // Fetch detailed information about the pull request
      const pullRequestResponse = await octokit.graphql(
        `
        query($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_COMMIT]) {
                nodes {
                  __typename
                  ... on ReviewRequestedEvent {
                    createdAt
                  }
                  ... on PullRequestCommit {
                    commit {
                      committedDate
                    }
                  }
                }
              }
              reviews(first: 50, states: [APPROVED, CHANGES_REQUESTED, COMMENTED]) {
                nodes {
                  createdAt
                  author {
                    login
                  }
                }
              }
              comments(first: 100) {
                nodes {
                  body
                  createdAt
                  author {
                    login
                  }
                }
              }
            }
          }
        }
        `,
        {
          owner: github.context.repo.owner, // Repository owner
          name: github.context.repo.repo,  // Repository name
          number: pr.number,               // Pull request number
        }
      );

      // Filter review request events from the timeline
      const reviewRequestEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
        (node) => node.__typename === "ReviewRequestedEvent"
      );

      // Filter commit events from the timeline
      const commitEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
        (node) => node.__typename === "PullRequestCommit"
      );

      // Get the latest event time from review requests and commits
      const latestEventTime = new Date(
        Math.max(
          ...reviewRequestEvents.map(event => new Date(event.createdAt).getTime()),
          ...commitEvents.map(event => new Date(event.commit.committedDate).getTime())
        )
      );

      // Combine reviews and comments into a single array
      const reviewsAndComments = [
        ...pullRequestResponse.repository.pullRequest.reviews.nodes,
        ...pullRequestResponse.repository.pullRequest.comments.nodes
      ];

      // Filter reviews and comments to only include those after the latest event time
      const reviewsAndCommentsAfterLatestEvent = reviewsAndComments.filter(
        (item) => new Date(item.createdAt) > latestEventTime
      );

      // Get the usernames of reviewers who have reviewed or commented
      const reviewersWhoReviewedOrCommented = reviewsAndCommentsAfterLatestEvent.map(
        (item) => item.author.login
      );

      // Get detailed information about the pull request
      const { data: pullRequest } = await octokit.rest.pulls.get({
        ...github.context.repo,
        pull_number: pr.number,
      });

      // Filter requested reviewers to only include those who have not reviewed or commented
      const reviewersToRemind = pullRequest.requested_reviewers.filter(
        (rr) => !reviewersWhoReviewedOrCommented.includes(rr.login)
      );

      // If there are no reviewers to remind, continue to the next pull request
      if (reviewersToRemind.length === 0) {
        continue;
      }

      // Calculate the current time and the review by time based on the latest event
      const currentTime = new Date().getTime();
      const reviewByTime = latestEventTime.getTime() + 1000 * 60 * 60 * reviewTurnaroundHours;

      // Log the current time and review by time for debugging
      core.info(`currentTime: ${currentTime} reviewByTime: ${reviewByTime}`);
      // If the current time is less than the review by time, continue to the next pull request
      if (currentTime < reviewByTime) {
        continue;
      }

      // Filter reminder comments to only include those with the reminder message
      const reminderComments = pullRequestResponse.repository.pullRequest.comments.nodes.filter(
        (node) => node.body.includes(reminderMessage)
      );

      // Get the most recent reminder comment, if any
      const mostRecentReminderComment = reminderComments.length > 0
        ? new Date(reminderComments[0].createdAt)
        : null;

      // If the most recent reminder comment is within the review turnaround time, continue to the next pull request
      if (mostRecentReminderComment && mostRecentReminderComment.getTime() + 1000 * 60 * 60 * reviewTurnaroundHours > currentTime) {
        continue;
      }

      // Post individual comments to each reviewer who has not reviewed or commented
      // This section is modified to send individual notifications
      for (const reviewer of reviewersToRemind) {
        const addReminderComment = `@${reviewer.login} \n${reminderMessage}`;

        // Post the reminder comment to the pull request
        await octokit.rest.issues.createComment({
          ...github.context.repo,
          issue_number: pullRequest.number,
          body: addReminderComment,
        });

        // Log the creation of the reminder comment
        core.info(`Created comment on issue_number: ${pullRequest.number} body: ${addReminderComment}`);
      } // End of modified section
    }
  } catch (error) {
    // If there is an error, set the action to failed and log the error message
    core.setFailed(error.message);
  }
}

// Run the main function
run();
