// __mocks__/@google/genai.js

// Provide a basic mock for the GoogleGenAI class using ES module syntax
class MockGoogleGenAI {
  constructor(apiKey) {
    console.log('[MockGoogleGenAI] Constructor called with apiKey:', apiKey);
  }

  getGenerativeModel(params) {
    console.log('[MockGoogleGenAI] getGenerativeModel called with params:', params);
    // Return an object that mocks the generativeModel, including any functions called by the app
    return {
      startChat: () => ({ // Using jest.fn() if more advanced mocking features are needed later
        sendMessageStream: async function* () {
          yield { text: () => "mocked stream response chunk 1" };
          yield { text: () => "mocked stream response chunk 2" };
        },
        sendMessage: async () => ({
          response: {
            text: () => "mocked single response",
          },
        }),
      }),
      generateContentStream: async function* () {
        yield { text: () => "mocked stream response chunk 1" };
        yield { text: () => "mocked stream response chunk 2" };
      },
      generateContent: async () => ({
        response: {
          text: () => "mocked single response",
        },
      }),
    };
  }
}

// Export the mocked class using ES module syntax
export const GoogleGenAI = MockGoogleGenAI;

// If other named exports like HarmCategory or HarmBlockThreshold are needed at runtime:
// export const HarmCategory = { HARM_CATEGORY_UNSPECIFIED: "HARM_CATEGORY_UNSPECIFIED" };
// export const HarmBlockThreshold = { BLOCK_NONE: "BLOCK_NONE" };

// If there's a default export expected (less common for classes, but possible)
// export default MockGoogleGenAI;
