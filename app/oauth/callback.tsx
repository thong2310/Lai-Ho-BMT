import { ThemedView } from "@/components/themed-view";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { PENDING_OAUTH_STATE_KEY } from "@/constants/oauth";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CallbackParam = string | string[] | undefined;

function firstParam(value: CallbackParam): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function callbackValues(url: string): {
  code?: string;
  state?: string;
  error?: string;
} {
  const search = new URL(url, "http://localhost").searchParams;
  return {
    code: search.get("code") ?? undefined,
    state: search.get("state") ?? undefined,
    error: search.get("error") ?? undefined,
  };
}

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: CallbackParam;
    state?: CallbackParam;
    error?: CallbackParam;
  }>();
  const handled = useRef(false);
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      try {
        if (Platform.OS === "web")
          throw new Error("OAuth callback must be handled by the API");

        let code = firstParam(params.code);
        let state = firstParam(params.state);
        let error = firstParam(params.error);

        if (!code || !state || error) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const parsed = callbackValues(initialUrl);
            code ??= parsed.code;
            state ??= parsed.state;
            error ??= parsed.error;
          }
        }

        if (error) throw new Error(error);
        if (!code || !state) throw new Error("Missing code or state parameter");

        // Read and delete before exchanging. This makes the native authorization response
        // single-use in this client and prevents a callback with an unrelated state from being
        // forwarded to the backend.
        const pendingState = await SecureStore.getItemAsync(
          PENDING_OAUTH_STATE_KEY,
        );
        await SecureStore.deleteItemAsync(PENDING_OAUTH_STATE_KEY);
        if (!pendingState || pendingState !== state)
          throw new Error("OAuth state mismatch");

        const result = await Api.exchangeOAuthCode(code, state);
        if (!result.sessionToken) throw new Error("No session token received");

        await Auth.setSessionToken(result.sessionToken);
        if (result.user) {
          await Auth.setUserInfo({
            id: result.user.id,
            openId: result.user.openId,
            name: result.user.name,
            email: result.user.email,
            loginMethod: result.user.loginMethod,
            lastSignedIn: new Date(result.user.lastSignedIn || Date.now()),
          });
        }

        setStatus("success");
        setTimeout(() => router.replace("/(tabs)"), 500);
      } catch (error) {
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to complete authentication",
        );
      }
    };

    void handleCallback();
  }, [params.code, params.state, params.error, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Completing authentication...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">
              Authentication successful!
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              Redirecting...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              Authentication failed
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
