# SQRAI-V2 Project

## Introduction

The SQRAI-V2 project is designed to provide a comprehensive suite of tools and utilities for managing and interacting with GitHub repositories. This project includes various plugins and actions that facilitate tasks such as cloning repositories, generating documentation, summarizing repository contents, and creating pull requests.

## Packages

### `plugin-github`

This package provides a set of actions for interacting with GitHub repositories. It includes functionalities for cloning repositories, generating documentation, summarizing repository contents, and creating pull requests. The actions are designed to be used within a GitHub Actions workflow or as standalone utilities. The provided actions are:

- `CLONE_REPO`: clone a repository and save its information to the database. Cloned code is stored in the `agent/repos` directory and its content will be summarized and stored in agent memories.
- `GENDOC`: generate documentation for a repository. The agent will try to generate documentation for a specific file or folder provided by the user.
- `SUMMARIZE_REPO`: generate a summary of a repository.
- `EXPLAIN_PROJECT`: answer questions about a project, it could be a summary of the project, how to use it, etc. The agent will try to answer the question by retrieving information from memory and reading relevant files in the repository.
  For now, it only supports public repositories. In the future, we plan to add support for private repositories.

### `client-direct`

This package is based on the client-direct package of Eliza. It provides additional functionalities as a API server for other plugins. Aside from the default endpoints, it also provides endpoints for retrieving past messages, delete knowledge of an agent, and allow other plugins to register their endpoints.
New endpoints:

- GET /:agentId/messages: retrieves past messages of the agent
- DELETE /:agentId/knowledge: deletes all knowledge of the agent

At the moment, to register plugins' endpoints, we need to manually add the endpoints to the client-direct package. In the future, we will provide a way for plugins to register their endpoints automatically from their own packages.

### `plugin-calendar`

This plugin provides actions for managing tasks and events for an agent. It acts as an interface for a bull-mq queue to manage tasks and events. It includes 2 actions:

- `SET_CALENDAR`: set a task for the agent. The task could be a simple reminder or a complex task that requires multiple actions to complete. It supports cron expression for recurring tasks.
- `NOTIFY_EVENT`: a simple action that the agent can use to notify the user at a predefined time. Together with the `SET_CALENDAR` action, the user can request the agent to notify them at a specific time.

It provides additional API endpoints to retrieve the agent's tasks and events. The endpoints are:

- `GET /cals/events`: retrieves all events of the agent
- `DELETE /cals/events/:eventId`: deletes a specific event of the agent (to be implemented)
  The endpoint is implemented in `plugin-calendar/src/api.ts` and registered in `client-direct/src/index.ts`.

### `bull-mq`

This package is the backend for the `plugin-calendar` package. It provides functionalities for handling background tasks and job processing. It includes actions for creating, processing, and managing jobs in a queue to ensure reliable job processing. In the future, it will be merged with the `plugin-calendar` package to provide a seamless experience for managing tasks and events. It requires `REDIS_URL` for bull-mq to work.

### `plugin-firecrawl`

This package provides integration with FireCrawl for web crawling and indexing. The main actions are:

- `CRAWL_WEBSITE`: the agent will crawl a website specified by the user and extract relevant information. The information will be stored as knowledge in the agent's database for future actions.
- `CHECK_STATUS`: allow agent check the status of the crawling process and respond to the user.
  The package depends on the `plugin-calender` package to manage the crawling process in the background.

Note: This package requires a FIRECRAWL_API_KEY to work.

### `plugin-reason`

This plugin allows the agent to construct a plan based on the user's request. It helps the agent to make complex course of actions that require executing multiple actions in a specific order. It includes the action `MAKE_PLAN` which will generate a plan based on the user's request by evaluating the agent's possible actions. We plan to expand this plugin to include more complex reasoning as well as make this the default action for the agent to improve decision-making.

### `sqrdao-client-twitter`

This package provides a client for interacting with the Twitter API using OAuth 2.0 for access token retrieval. It offers functionalities such as posting tweets, retrieving user timelines, and searching for tweets. Ideal for integrating Twitter features into your workflows, this package simplifies API interactions.

## Installation

To set up the development environment for this plugin, follow these steps:

1. Install dependencies:
    ```sh
    pnpm i
    ```
2. Set up the environment variables:

    ```sh
    cp .env.example .env
    ```

    Edit the `.env` file to include the following variables:

    ```sh
    # For common
    GOOGLE_GENERATIVE_AI_API_KEY=<your_gemini_api_key> # Use google provider to generate AI responses
    CACHE_STORE=database # Use database to cache data
    POSTGRES_URL=postgresql://your_user:your_password@localhost:5432/gmx?schema=public
    REDIS_URL=redis://localhost:6379 # Use redis to use plugin-bullmq

    GITHUB_PATH=packages/plugin-github/src
    GITHUB_API_TOKEN=    # GitHub API token

    # For FireCrawl
    FIRECRAWL_API_KEY=
    FIRECRAWL_SAVE_KNOWLEDGE_MODE=summary

    # For Twitter Client
    TWITTER_CLIENT_ID=
    TWITTER_CLIENT_SECRET=
    ```

3. Start the server with an example character configuration:
    ```sh
    pnpm start --character='characters/codebot.character.json'
    ```
4. In another terminal, start the client:
    ```sh
    pnpm start:client
    ```
5. Using terminal UI for full functionality: [sqrAI-terminal](https://github.com/sqrDAO/sqrAI-terminal)

## Usage Instructions

The project can be deployed as is to use all supported functionalities. It can be further extended the same way as Eliza by adding more plugins and actions. Plugins can also be used in other Eliza-based projects but may require some modifications to work properly.

## Development

The project is based on Eliza@0.1.7 and uses the same structure for plugins and actions. Each plugin is a separate package that can be developed and tested independently. Refer to [Eliza documentation](https://elizaos.github.io/eliza/) for more information on how to develop plugins and actions.
We will regularly update the Eliza version to catchup with the latest changes and improvements.
