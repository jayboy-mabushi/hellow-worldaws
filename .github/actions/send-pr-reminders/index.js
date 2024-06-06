
// const core = require("@actions/core");
// const github = require("@actions/github");

// async function run() {
//   try {
//     const octokit = github.getOctokit(core.getInput("github_token"));
//     const reminderMessage = core.getInput("reminder_message");
//     const reviewTurnaroundMinutes = parseInt(core.getInput("review_turnaround_minutes"), 10);

//     const { data: pullRequests } = await octokit.rest.pulls.list({
//       ...github.context.repo,
//       state: "open",
//     });

//     for (const pr of pullRequests) {
//       core.info(`PR title: ${pr.title}`);

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
//                 }
//               }
//             }
//           }
//         }
//         `,
//         {
//           owner: github.context.repo.owner,
//           name: github.context.repo.repo,
//           number: pr.number,
//         }
//       );

//       const reviewRequestEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
//         (node) => node.__typename === "ReviewRequestedEvent"
//       );

//       if (reviewRequestEvents.length === 0) {
//         continue;
//       }

//       const mostRecentReviewRequest = new Date(reviewRequestEvents[0].createdAt);
//       const reviewsAfterRequest = pullRequestResponse.repository.pullRequest.reviews.nodes.filter(
//         (review) => new Date(review.createdAt) > mostRecentReviewRequest
//       );

//       const reviewersWhoReviewed = reviewsAfterRequest.map((review) => review.author.login);

//       const { data: pullRequest } = await octokit.rest.pulls.get({
//         ...github.context.repo,
//         pull_number: pr.number,
//       });

//       const reviewersToRemind = pullRequest.requested_reviewers.filter(
//         (rr) => !reviewersWhoReviewed.includes(rr.login)
//       );

//       if (reviewersToRemind.length === 0) {
//         continue;
//       }

//       const currentTime = new Date().getTime();
//       const reviewByTime = mostRecentReviewRequest.getTime() + 1000 * 60 * reviewTurnaroundMinutes;

//       core.info(`currentTime: ${currentTime} reviewByTime: ${reviewByTime}`);
//       if (currentTime < reviewByTime) {
//         continue;
//       }

//       const reminderComments = pullRequestResponse.repository.pullRequest.comments.nodes.filter(
//         (node) => node.body.includes(reminderMessage)
//       );

//       const mostRecentReminderComment = reminderComments.length > 0
//         ? new Date(reminderComments[0].createdAt)
//         : null;

//       if (mostRecentReminderComment && mostRecentReminderComment.getTime() + 1000 * 60 * reviewTurnaroundMinutes > currentTime) {
//         continue;
//       }

//       const reviewers = reviewersToRemind.map((rr) => `@${rr.login}`).join(", ");
//       const addReminderComment = `${reviewers} \n${reminderMessage}`;

//       await octokit.rest.issues.createComment({
//         ...github.context.repo,
//         issue_number: pullRequest.number,
//         body: addReminderComment,
//       });

//       core.info(`Created comment on issue_number: ${pullRequest.number} body: ${addReminderComment}`);
//     }
//   } catch (error) {
//     core.setFailed(error.message);
//   }
// }

// run();

const core = require("@actions/core");
const github = require("@actions/github");

async function run() {
  try {
    const octokit = github.getOctokit(core.getInput("github_token"));
    const reminderMessage = core.getInput("reminder_message");
    const reviewTurnaroundMinutes = parseInt(core.getInput("review_turnaround_minutes"), 10);

    const { data: pullRequests } = await octokit.rest.pulls.list({
      ...github.context.repo,
      state: "open",
    });

    for (const pr of pullRequests) {
      core.info(`PR title: ${pr.title}`);

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
          owner: github.context.repo.owner,
          name: github.context.repo.repo,
          number: pr.number,
        }
      );

      const reviewRequestEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
        (node) => node.__typename === "ReviewRequestedEvent"
      );

      if (reviewRequestEvents.length === 0) {
        continue;
      }

      const mostRecentReviewRequest = new Date(reviewRequestEvents[0].createdAt);

      const reviewsAndComments = [
        ...pullRequestResponse.repository.pullRequest.reviews.nodes,
        ...pullRequestResponse.repository.pullRequest.comments.nodes
      ];

      const reviewsAndCommentsAfterRequest = reviewsAndComments.filter(
        (item) => new Date(item.createdAt) > mostRecentReviewRequest
      );

      const reviewersWhoReviewedOrCommented = reviewsAndCommentsAfterRequest.map(
        (item) => item.author.login
      );

      const { data: pullRequest } = await octokit.rest.pulls.get({
        ...github.context.repo,
        pull_number: pr.number,
      });

      const reviewersToRemind = pullRequest.requested_reviewers.filter(
        (rr) => !reviewersWhoReviewedOrCommented.includes(rr.login)
      );

      if (reviewersToRemind.length === 0) {
        continue;
      }

      const currentTime = new Date().getTime();
      const reviewByTime = mostRecentReviewRequest.getTime() + 1000 * 60 * reviewTurnaroundMinutes;

      core.info(`currentTime: ${currentTime} reviewByTime: ${reviewByTime}`);
      if (currentTime < reviewByTime) {
        continue;
      }

      const reminderComments = pullRequestResponse.repository.pullRequest.comments.nodes.filter(
        (node) => node.body.includes(reminderMessage)
      );

      const mostRecentReminderComment = reminderComments.length > 0
        ? new Date(reminderComments[0].createdAt)
        : null;

      if (mostRecentReminderComment && mostRecentReminderComment.getTime() + 1000 * 60 * reviewTurnaroundMinutes > currentTime) {
        continue;
      }

      const reviewers = reviewersToRemind.map((rr) => `@${rr.login}`).join(", ");
      const addReminderComment = `${reviewers} \n${reminderMessage}`;

      await octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: pullRequest.number,
        body: addReminderComment,
      });

      core.info(`Created comment on issue_number: ${pullRequest.number} body: ${addReminderComment}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();

