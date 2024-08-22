const core = require("@actions/core");
const github = require("@actions/github");
const REMINDER_POSTFIX = 'Automated Reminder';

// Function to calculate business days between two dates
function businessDaysDiff(startDate, endDate) {
  let count = 0;
  let curDate = new Date(startDate);

  // Ensure startDate is always before or equal to endDate
  if (curDate > endDate) {
    return 0; // No business days if the start date is after the end date
  }

  // Loop through each day between the start and end dates
  while (curDate <= endDate) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }

  return count;
}

// Main function to run the action
async function run() {
  try {
    // Get the GitHub token from the input
    const octokit = github.getOctokit(core.getInput("github_token"));
    // Get the review turnaround time in hours from the input and parse it as an integer
    const reviewTurnaroundHours = parseInt(core.getInput("review_turnaround_hours"), 10);

    // Convert hours to working days (assuming 8-hour workdays)
    const reviewTurnaroundDays = Math.ceil(reviewTurnaroundHours / 8);

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
        node => node.__typename === "ReviewRequestedEvent"
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

      // Calculate the review by time based on the latest event and skipping weekends
      const currentTime = new Date();
      const businessDaysPassed = businessDaysDiff(latestEventTime, currentTime);

      // If the business days passed is less than the review turnaround days, continue to the next pull request
      if (businessDaysPassed < reviewTurnaroundDays) {
        continue;
      }

      // Filter reminder comments to only include those with the reminder message
      const reminderComments = pullRequestResponse.repository.pullRequest.comments.nodes.filter(
        (node) => node.body.includes(REMINDER_POSTFIX),
      );

      // Get the most recent reminder comment, if any
      const mostRecentReminderComment = reminderComments.length > 0
        ? new Date(reminderComments[0].createdAt)
        : null;

      // If the most recent reminder comment is within the review turnaround time, continue to the next pull request
      if (mostRecentReminderComment && businessDaysDiff(mostRecentReminderComment, currentTime) < reviewTurnaroundDays) {
        continue;
      }

      // Calculate the time elapsed since the latest event in business hours
      const businessHoursElapsed = Math.max(0, (businessDaysPassed - 1) * 8 + (currentTime.getHours() - latestEventTime.getHours()));

      // Calculate business days elapsed
      const businessDaysElapsed = Math.floor(businessHoursElapsed / 8);

      // Determine the appropriate reminder message based on the business days elapsed
      let dynamicReminderMessage;
      if (businessDaysElapsed >= 6) {
        dynamicReminderMessage = `It has been more than 6 business days since the review was requested. Please prioritize reviewing this PR.`;
      } else if (businessDaysElapsed >= 3) {
        dynamicReminderMessage = `It has been more than 3 business days since the review was requested. Please prioritize reviewing this PR.`;
      } else {
        dynamicReminderMessage = `It has been more than ${businessDaysElapsed} business days since the review was requested. Please prioritize reviewing this PR.`;
      }

      // Post individual comments to each reviewer who has not reviewed or commented
      for (const reviewer of reviewersToRemind) {
        const addReminderComment = `@${reviewer.login} \nReminder: ${dynamicReminderMessage} - ${REMINDER_POSTFIX}`;

        // Post the reminder comment to the pull request
        await octokit.rest.issues.createComment({
          ...github.context.repo,
          issue_number: pullRequest.number,
          body: addReminderComment,
        });

        // Log the creation of the reminder comment
        core.info(`Created comment on issue_number: ${pullRequest.number} body: ${addReminderComment}`);
      }
    }
  } catch (error) {
    // If there is an error, set the action to failed and log the error message
    core.setFailed(error.message);
  }
}

// Run the main function
run();
