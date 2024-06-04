const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    console.log('core.getInput:', typeof core.getInput); // Add debug log to check if core.getInput is defined

    const octokit = github.getOctokit(core.getInput('github_token'));
    const reminderMessage = core.getInput('reminder_message');
    const reviewTurnaroundHours = parseInt(core.getInput('review_turnaround_hours'), 10);

    const { data: pullRequests } = await octokit.rest.pulls.list({
      ...github.context.repo,
      state: 'open'
    });

    for (const pr of pullRequests) {
      core.info(`pr title: ${pr.title}`);

      const pullRequestResponse = await octokit.graphql(`
        query($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_COMMIT]) { // Include PULL_REQUEST_COMMIT to get commit dates
                nodes {
                  __typename
                  ... on ReviewRequestedEvent {
                    createdAt
                  }
                  ... on PullRequestCommit { // Add PULL_REQUEST_COMMIT to fetch commit dates
                    commit {
                      committedDate
                    }
                  }
                }
              }
              reviews(first: 50, states: [APPROVED, CHANGES_REQUESTED, COMMENTED]) {
                nodes {
                  __typename
                  ... on PullRequestReview {
                    createdAt
                    author { // Add author to get reviewer's username
                      login
                    }
                  }
                }
              }
              comments(first: 100) {
                nodes {
                  body
                  createdAt // Add createdAt to get the timestamp of the comment
                }
              }
            }
          }
        }
      `, {
        owner: github.context.repo.owner,
        name: github.context.repo.repo,
        number: pr.number
      });

      // Filter review request events
      const reviewRequestEvents = pullRequestResponse.repository.pullRequest.timelineItems.nodes.filter(
        node => node.__typename === 'ReviewRequestedEvent'
      );

      if (reviewRequestEvents.length === 0) { // If no review request events, skip this PR
        continue;
      }

      // Get the most recent review request date
      const mostRecentReviewRequest = new Date(reviewRequestEvents[0].createdAt);

      // Filter reviews to find those made after the most recent review request
      const reviewsAfterRequest = pullRequestResponse.repository.pullRequest.reviews.nodes.filter(
        review => new Date(review.createdAt) > mostRecentReviewRequest
      );

      // Collect the usernames of reviewers who have already reviewed
      const reviewersWhoReviewed = reviewsAfterRequest.map(review => review.author.login);

      // Get the requested reviewers from the pull request details
      const { data: pullRequest } = await octokit.rest.pulls.get({
        ...github.context.repo,
        pull_number: pr.number
      });

      // Filter out reviewers who have already reviewed
      const reviewersToRemind = pullRequest.requested_reviewers.filter(
        rr => !reviewersWhoReviewed.includes(rr.login)
      );

      if (reviewersToRemind.length === 0) { // If all reviewers have reviewed, skip this PR
        continue;
      }

      // Calculate reviewByTime based on the most recent review request time
      const currentTime = new Date().getTime();
      const reviewByTime = mostRecentReviewRequest.getTime() + 1000 * 60 * 60 * reviewTurnaroundHours;

      core.info(`currentTime: ${currentTime} reviewByTime: ${reviewByTime}`);
      if (currentTime < reviewByTime) { // Check if the current time is less than the review by time
        continue;
      }

      // Check for the most recent reminder comment
      const reminderComments = pullRequestResponse.repository.pullRequest.comments.nodes.filter(node => {
        return node.body.match(RegExp(reminderMessage)) != null;
      });

      // Find the most recent reminder comment
      const mostRecentReminderComment = reminderComments.length > 0 ? new Date(reminderComments[0].createdAt) : null;

      if (mostRecentReminderComment && mostRecentReminderComment.getTime() > mostRecentReviewRequest.getTime()) {
        // If there is a reminder comment after the most recent review request, skip this PR
        continue;
      }

      const reviewers = reviewersToRemind.map(rr => `@${rr.login}`).join(', ');
      const addReminderComment = `${reviewers} \n${reminderMessage}`;

      await octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: pullRequest.number,
        body: addReminderComment
      });

      core.info(`create comment issue_number: ${pullRequest.number} body: ${reviewers} ${addReminderComment}`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
