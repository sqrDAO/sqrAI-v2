import { Action, composeContext, Content, createGoal, elizaLogger, generateText, Goal, GoalStatus, HandlerCallback, IAgentRuntime, Memory, parseJsonArrayFromText, parseJSONObjectFromText, State, stringToUuid } from "@elizaos/core";

// this is a system action that should only be used by the system or the agent itself
// the chat room should be the agent's room
export const makePlanAction: Action = {
    name: "MAKE_PLAN",
    similes: ["ACTIONS_PLAN", "MAKE_A_PLAN", "DECIDE_COURSE_OF_ACTION"],
    description: `
    Make a plan of multiple actions to achieve a goal.
    This action should have the highest priority of all actions.
    Whenever there is a uncentainty for the next action, this action should be selected.
    `,
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating make plan request");
        elizaLogger.log("Message:", _message);
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        _options: any,
        callback: HandlerCallback | undefined
    ) => {
      // use llm to make a plan
      // a plan consists of multiple actions for a goal
      // actions should be selected from list of available actions
      // each action will be an objective of the goal
      // actions will be executed in sequence, with the context of the previous action

      // first, summary the goal of the user
      const goalContext = composeContext({
          state,
          template: `
              The user wants the agent to do certain things.
              This is the conversation, extracted from the user's messages:
              - the goal of the user and detail of the goal, should include relevant information about the user
              - should focused on recent messages and what the user requested
              - should check if the goal matches the user's intent
              - should check if the goal is clear and specific

              Conversation:
              {{recentMessages}}

              Output in JSON format wrapped in tripple backticks:
              \`\`\`
              {
                  "success": "TRUE/FALSE",
                  "name": "the goal of the user and detail of the goal",
              }
              \`\`\`
          `
      });
      const goalText = await generateText({
          runtime,
          context: goalContext,
          modelClass: "small"
      })
      elizaLogger.log("Goal text:", goalText);

      const parsedGoal = parseJSONObjectFromText(goalText);
      if (!parsedGoal.success) {
          elizaLogger.error("Failed to parse goal text");
          await callback?.({
            text: "I'm sorry, I don't understand what you want me to do",
          });
          return;
      }

      const selfRoomId = stringToUuid(`reason-${state.roomId}`);
      await runtime.ensureConnection(
          state.agentId,
          selfRoomId,
      );

      const goal: Goal = {
          id: stringToUuid(parsedGoal.name + "-" + state.roomId),
          name: parsedGoal.name,
          // roomId: selfRoomId,
          roomId: state.roomId,
          // userId: state.agentId,
          userId: state.userId,
          status: GoalStatus.IN_PROGRESS,
          objectives: [],
      }
      await createGoal({
          runtime,
          goal
      });

      const selfMessage: Memory = {
          agentId: runtime.agentId,
          // roomId: selfRoomId,
          roomId: state.roomId,
          userId: runtime.agentId,
          content: {
              text: `I will construct a plan to achieve the goal as requested by the user: ${goal.name}`,
          }
      }

      let newState = await runtime.composeState(selfMessage);

      const planContext = composeContext({
          state: newState,
          template: `
              The agent will construct a course of actions to achieve the goal.

              GOAL:
              {{goals}}

              Messages:
              {{recentMessages}}

              Actions:
              {{actions}}

              Action's examples:
              {{actionExamples}}

              Construct a plan by selecting the most appropriate actions from the available actions to achieve the goal.
              The plan should be an array of actions in the order they should be executed.
              The action MAKE_PLAN should not be included in the plan.

              Output in JSON array wrapped in tripple backticks, do not use " or ' in the text as it will break the JSON format:
              \`\`\`json
              [
                  {
                      "action": "ACTION_NAME",
                      "additional_message": "a self-explanatory message for the action, used as a reference by the agent",
                  },
                  ...
              ]
              \`\`\`
          `
      });
      const planText = await generateText({
          runtime,
          context: planContext,
          modelClass: "large"
      });
      const parsedPlan = parseJsonArrayFromText(planText);
      if (!parsedPlan) {
          elizaLogger.error(`Failed to parse plan text: ${planText}`);
          await callback?.({
            text: "I'm sorry, I can't do that right now",
          });
          return;
      }

      // we store the messages in the memory so that they can be used in the next action
      // we will remove the messages after the plan is executed
      const tempMessages: Memory[] = [];

      // execute the plan
      elizaLogger.log("parsedPlan: ", parsedPlan);
      for (const action of parsedPlan) {
          // the agent will use the same context as the current room
          const actionMessage: Memory = {
              id: stringToUuid(`temp-${state.roomId}-${action.additional_message}`),
              agentId: runtime.agentId,
              // roomId: selfRoomId,
              roomId: state.roomId,
              userId: runtime.agentId,
              content: {
                  text: action.additional_message,
                  action: action.action,
              }
          }
          await runtime.messageManager.createMemory(actionMessage);
          tempMessages.push(actionMessage);


          // the agent will process each action
          // the action handler will receive the original message contains the goal and the original state
          // result of previous action could be accessed from recentMessages if required
          await runtime.processActions(
              actionMessage,
              [actionMessage],
              newState,
              async (response: Content): Promise<[Memory]> => {
                  // save the message so that it can be used in the next action
                  const memory: Memory = {
                      id: stringToUuid(`temp-${state.roomId}-${response.text}`),
                      agentId: runtime.agentId,
                      // roomId: selfRoomId,
                      roomId: state.roomId,
                      userId: runtime.agentId,
                      content: response,
                  }
                  await runtime.messageManager.createMemory(memory);
                  tempMessages.push(memory);
                  newState = await runtime.updateRecentMessageState(newState);

                  return [memory]
              }
          );

      }

      // generate the final response for user
      const finalResponseContext = composeContext({
          state: newState,
          template: `
              The agent has completed planned actions and retrieved the result of each action
              Now, summarize all the results and provide the final response to the user.

              The original goal is:
              {{goals}}

              The taken actions and results are the latest messages:
              {{recentMessages}}

              Compose a final response to the user from the results of each action.
          `
      });
      const finalResponse = await generateText({
          runtime,
          context: finalResponseContext,
          modelClass: "small"
      });

      // remove the temp messages
      for (const message of tempMessages) {
          await runtime.messageManager.removeMemory(message.id);
      }

      await callback?.({
          text: finalResponse,
          user: state.agentName
      });
      return true;
    },
    examples: [
      [
        {
          "user": "{{user1}}",
          "content": {
            text: "Summary information about the project",
          }
        },
        {
          "user": "{{agentName}}",
          "content": {
            text: "I will retrieve the information and provide you with a summary",
            action: "MAKE_PLAN",
          }
        }
      ],
      [
        {
          "user": "{{user1}}",
          "content": {
            text: "I need to know the status of the project",
          }
        },
        {
          "user": "{{agentName}}",
          "content": {
            text: "I will retrieve the information and provide you with the status",
            action: "MAKE_PLAN",
          }
        }
      ]
    ],
};
