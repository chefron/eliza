import dotenv from "dotenv";
import { zeroUuid } from "../core/constants.ts";
import { composeContext } from "../core/context.ts";
import { embeddingZeroVector } from "../core/memory.ts";
import { type AgentRuntime } from "../core/runtime.ts";
import { Content, Memory, State, type UUID } from "../core/types.ts";
import { createRuntime } from "../test_resources/createRuntime.ts";
import {
  GetTellMeAboutYourselfConversationTroll1,
  GetTellMeAboutYourselfConversationTroll2,
  Goodbye1,
} from "../test_resources/data.ts";
import { getOrCreateRelationship } from "../test_resources/getOrCreateRelationship.ts";
import { populateMemories } from "../test_resources/populateMemories.ts";
import { runAiTest } from "../test_resources/runAiTest.ts";
import { messageHandlerTemplate } from "../test_resources/templates.ts";
import { type User } from "../test_resources/types.ts";
import action from "./ignore.ts";

async function handleMessage(
  runtime: AgentRuntime,
  message: Memory,
  state?: State,
) {
  const _saveRequestMessage = async (message: Memory, state: State) => {
    const { content: senderContent, userId, roomId } = message;

    const _senderContent = (senderContent as Content).text?.trim();
    if (_senderContent) {
      await runtime.messageManager.createMemory({
        userId: userId!,
        content: {
          text: _senderContent,
          action: (message.content as Content)?.action ?? "null",
        },
        roomId,
        embedding: embeddingZeroVector,
      });
    }
  };

  await _saveRequestMessage(message, state as State);
  if (!state) {
    state = (await runtime.composeState(message)) as State;
  }

  const context = composeContext({
    state,
    template: messageHandlerTemplate,
  });

  const { userId, roomId } = message;

  let response = await runtime.messageCompletion({
    context,
    stop: [],
  });

  await runtime.databaseAdapter.log({
    body: { message, context, response },
    userId: userId,
    roomId,
    type: "ignore_test_completion",
  });

  const responseMessage: Memory = {
    userId: runtime.agentId,
    content: response,
    roomId,
    embedding: embeddingZeroVector,
  };

  if (responseMessage.content.text?.trim()) {
    await runtime.messageManager.createMemory(responseMessage);
    await runtime.evaluate(message, state);
    await runtime.processActions(message, [responseMessage]);
  } else {
    console.warn("Empty response, skipping");
  }

  return responseMessage;
}

// use .dev.vars for local testing
dotenv.config({ path: ".dev.vars" });

describe("Ignore action tests", () => {
  let user: User;
  let runtime: AgentRuntime;
  let roomId: UUID;

  afterAll(async () => {
    await cleanup();
  });

  beforeAll(async () => {
    const setup = await createRuntime({
      env: process.env as Record<string, string>,
      actions: [action],
    });
    user = setup.session.user;
    runtime = setup.runtime;

    const data = await getOrCreateRelationship({
      runtime,
      userA: user?.id as UUID,
      userB: zeroUuid,
    });

    console.log("data is", data);

    roomId = data?.roomId;
    console.log("*** data", data);
    console.log("Room ID", roomId);

    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  async function cleanup() {
    await runtime.factManager.removeAllMemories(roomId);
    await runtime.messageManager.removeAllMemories(roomId);
  }

  test("Test ignore action", async () => {
    await runAiTest("Test ignore action", async () => {
      const message: Memory = {
        userId: user?.id as UUID,
        content: { text: "Never talk to me again" },
        roomId: roomId as UUID,
      };

      await populateMemories(runtime, user, roomId, [
        GetTellMeAboutYourselfConversationTroll1,
      ]);

      const result = await handleMessage(runtime, message);

      return result.content.action === "IGNORE";
    });
  }, 120000);

  test("Action handler test 1: response should be ignore", async () => {
    await runAiTest(
      "Action handler test 1: response should be ignore",
      async () => {
        const message: Memory = {
          userId: user.id as UUID,
          content: { text: "", action: "IGNORE" },
          roomId: roomId as UUID,
        };

        await populateMemories(runtime, user, roomId, [
          GetTellMeAboutYourselfConversationTroll1,
        ]);

        await handleMessage(runtime, message);

        const state = await runtime.composeState(message);

        const lastMessage = state.recentMessagesData[0];

        return (lastMessage.content as Content).action === "IGNORE";
      },
    );
  }, 120000);

  test("Action handler test 2: response should be ignore", async () => {
    await runAiTest(
      "Action handler test 2: response should be ignore",
      async () => {
        const message: Memory = {
          userId: user.id as UUID,
          content: { text: "", action: "IGNORE" },
          roomId: roomId as UUID,
        };

        await populateMemories(runtime, user, roomId, [
          GetTellMeAboutYourselfConversationTroll2,
        ]);

        await handleMessage(runtime, message);

        const state = await runtime.composeState(message);

        const lastMessage = state.recentMessagesData[0];

        return (lastMessage.content as Content).action === "IGNORE";
      },
    );
  }, 120000);

  test("Expect ignore", async () => {
    await runAiTest("Expect ignore", async () => {
      const message: Memory = {
        userId: user.id as UUID,
        content: { text: "Bye" },
        roomId: roomId as UUID,
      };

      await populateMemories(runtime, user, roomId, [Goodbye1]);

      await handleMessage(runtime, message);

      const state = await runtime.composeState(message);

      const lastMessage = state.recentMessagesData[0];

      return (lastMessage.content as Content).action === "IGNORE";
    });
  }, 120000);
});