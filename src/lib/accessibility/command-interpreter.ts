/**
 * VOXONIX Deterministic Voice Command Interpreter
 *
 * Converts recognized Gnani Prisma v3.0 speech transcripts into validated,
 * context-aware website actions without calling any external LLM.
 *
 * SECURITY INVARIANT:
 * - Only whitelisted internal routes and fixed semantic intents can be returned.
 * - Arbitrary URLs, JavaScript execution, and unrestricted navigation are rejected.
 */

export const ALLOWED_ROUTES = new Set([
  "/",
  "/register",
  "/login",
  "/dashboard",
  "/settings",
  "/profile",
  "/media-test",
] as const);

export type AllowedRoute =
  | "/"
  | "/register"
  | "/login"
  | "/dashboard"
  | "/settings"
  | "/profile"
  | "/media-test";

export type VoiceCommandIntent =
  | "select_blind"
  | "navigate"
  | "go_back"
  | "scroll"
  | "read_page"
  | "repeat"
  | "stop_speaking"
  | "pause_listening"
  | "confirm"
  | "cancel"
  | "open_notifications"
  | "enter_name"
  | "change_name"
  | "enter_email"
  | "change_email"
  | "change_password"
  | "change_current"
  | "enter_password_guidance"
  | "continue_step"
  | "go_back_step"
  | "help_registration"
  | "start_again"
  | "stop_assistant"
  | "submit"
  | "add_password_chars"
  | "read_current_field"
  | "repeat_instruction"
  | "start_call"
  | "end_call"
  | "logout"
  | "mute_mic"
  | "unmute_mic"
  | "toggle_camera"
  | "read_messages"
  | "unknown";

export interface CommandInterpreterContext {
  currentRoute: string;
  registrationStep?: number;
  isAuthenticated?: boolean;
  isInCall?: boolean;
  hasPendingConfirmation?: boolean;
  /** True when the Blind assistant is actively capturing raw name, email, or password dictation. */
  isCapturingField?: boolean;
}

export interface InterpretedCommand {
  intent: VoiceCommandIntent;
  targetRoute?: AllowedRoute;
  scrollDirection?: "up" | "down";
  callAction?: "mute_mic" | "unmute_mic" | "toggle_camera" | "leave_call" | "read_messages";
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  spokenResponse: string;
  validForContext: boolean;
}

const ROUTE_PATTERNS: Array<{ nouns: string; route: AllowedRoute; spoken: string }> = [
  { nouns: "dashboard", route: "/dashboard", spoken: "Opening dashboard." },
  { nouns: "profile", route: "/profile", spoken: "Opening profile." },
  { nouns: "settings|preferences", route: "/settings", spoken: "Opening settings." },
  { nouns: "home|landing page|start page", route: "/", spoken: "Opening home page." },
  {
    nouns: "register|registration|sign up|signup",
    route: "/register",
    spoken: "Opening registration.",
  },
  { nouns: "login|log in|sign in|signin", route: "/login", spoken: "Opening sign in." },
  { nouns: "media test", route: "/media-test", spoken: "Opening media test." },
];

const ROUTE_MATCHERS: Array<{ pattern: RegExp; route: AllowedRoute; spoken: string }> =
  ROUTE_PATTERNS.map(({ nouns, route, spoken }) => ({
    pattern: new RegExp(
      `^(?:(?:(?:go\\s+)?to|go|open|navigate\\s+to|show|take\\s+me(?:\\s+to)?)\\s+(?:the\\s+|my\\s+)?)?(?:${nouns})$`,
      "i",
    ),
    route,
    spoken,
  }));

function cleanTranscriptForMatch(raw: string): string {
  return raw
    .trim()
    .replace(/[.,!?;:'"()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministically interprets a recognized utterance within the current route and state.
 */
export function interpretVoiceCommand(
  rawTranscript: string,
  ctx: CommandInterpreterContext,
): InterpretedCommand {
  const cleaned = cleanTranscriptForMatch(rawTranscript);
  const lower = cleaned.toLowerCase();
  const route = ctx.currentRoute || "/";
  const isRegister = route === "/register";
  const isLogin = route === "/login";
  const isInCall = Boolean(ctx.isInCall || route.startsWith("/room/"));

  if (!lower) {
    return {
      intent: "unknown",
      validForContext: false,
      spokenResponse: "I did not catch that. Please repeat your command.",
    };
  }

  // Reject unsafe URL / code execution attempts explicitly
  if (/javascript:|https?:\/\/|window\.|eval\(|<script/i.test(rawTranscript)) {
    return {
      intent: "unknown",
      validForContext: false,
      spokenResponse: "That command is not permitted. Say help to hear valid voice commands.",
    };
  }

  // 1. Speech & Audio Control Commands (Highest priority across all pages)
  if (
    /^(?:stop speaking|stop talking|be quiet|silence|mute voice|stop audio|shut up)$/i.test(lower)
  ) {
    return {
      intent: "stop_speaking",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (
    (isRegister || isLogin) &&
    /^(?:stop registration|stop login|stop sign in|stop voice|stop assistant|turn off(?: voice)?|exit registration|exit login)$/i.test(
      lower,
    )
  ) {
    return {
      intent: "stop_assistant",
      validForContext: true,
      spokenResponse: isLogin
        ? "Voice sign in stopped. You can continue with keyboard controls or enable voice again with Alt plus B."
        : "Voice registration paused. You can continue with keyboard controls or select Blind again.",
    };
  }

  if (
    /^(?:pause listening|stop listening|pause mic|pause microphone|mute microphone)$/i.test(
      lower,
    ) &&
    !isInCall
  ) {
    return {
      intent: "pause_listening",
      validForContext: true,
      spokenResponse: "Microphone listening paused.",
    };
  }

  if (/^(?:repeat|repeat that|say that again|what did you say|repeat last)$/i.test(lower)) {
    return {
      intent: "repeat",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (
    (isRegister || isLogin) &&
    /^(?:help|what can i say|voice help|commands|available commands)$/i.test(lower)
  ) {
    return {
      intent: "help_registration",
      validForContext: true,
      spokenResponse: isLogin
        ? "Available commands: spell your email before the at sign, confirm, change username, change domain, sign in, add more, change password, change email, repeat, go back, or cancel."
        : "Available commands: spell letter by letter, space, next, done, confirm, replace first name, replace surname, change username, change domain, backspace, clear, repeat, go back, start again, or stop.",
    };
  }

  if (/^(?:repeat (?:the )?(?:current )?instruction|repeat step|help)$/i.test(lower)) {
    return {
      intent: "repeat_instruction",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (
    isRegister &&
    /^(?:start again|start over|restart(?: registration)?|reset(?: registration)?)$/i.test(lower)
  ) {
    return {
      intent: "start_again",
      validForContext: true,
      spokenResponse: "Starting Blind registration again from full name.",
    };
  }

  if ((isRegister || isLogin) && /^(?:go back|previous step|back)$/i.test(lower)) {
    return {
      intent: "go_back_step",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (
    !ctx.isCapturingField &&
    (isRegister || isLogin) &&
    /^(?:change|change it|edit|clear(?: field)?)$/i.test(lower)
  ) {
    return {
      intent: "change_current",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (isRegister && /^(?:change|edit|reset|clear)\s+(?:my\s+)?name$/i.test(lower)) {
    return {
      intent: "change_name",
      validForContext: true,
      spokenResponse:
        "Cleared name. Please spell your first name by saying each letter separately.",
    };
  }

  if (
    (isRegister || isLogin) &&
    /^(?:change|edit|reset|clear)\s+(?:my\s+)?email(?:\s+address)?$/i.test(lower)
  ) {
    return {
      intent: "change_email",
      validForContext: true,
      spokenResponse:
        "Cleared email. Please spell the part before the at sign by saying each letter separately.",
    };
  }

  if (
    (isRegister || isLogin) &&
    /^(?:change|edit|reset|clear|re\s*enter|reenter|redo)\s+(?:my\s+)?password$/i.test(lower)
  ) {
    return {
      intent: "change_password",
      validForContext: true,
      spokenResponse: isLogin
        ? "Cleared password. Please dictate your password in short chunks and say done or next when finished."
        : "Cleared password fields. Please dictate your password in short chunks and say done or next when finished.",
    };
  }

  if (
    isLogin &&
    /^(?:add more|add more characters|more characters|add characters|append(?: characters)?|continue password)$/i.test(
      lower,
    )
  ) {
    return {
      intent: "add_password_chars",
      validForContext: true,
      spokenResponse:
        "Continue dictating additional password characters in short chunks, then say next or done when finished.",
    };
  }

  // While actively capturing raw field text (name/email/password), avoid hijacking content as nav/confirm commands
  if (ctx.isCapturingField) {
    return {
      intent: "unknown",
      validForContext: false,
      spokenResponse: "",
    };
  }

  // 2. Pending Confirmation Response ("confirm" / "yes" / "cancel" / "no")
  if (/^(?:confirm|yes|yeah|yep|proceed|do it|approved|sure|it is correct|correct)$/i.test(lower)) {
    return {
      intent: "confirm",
      validForContext: true,
      spokenResponse: "Confirmed.",
    };
  }

  if (/^(?:change|change it|edit)$/i.test(lower) && (isRegister || isLogin)) {
    return {
      intent: "change_current",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (/^(?:cancel|no|nope|abort|never mind|stop|back out)$/i.test(lower)) {
    return {
      intent: "cancel",
      validForContext: true,
      spokenResponse: "Canceled.",
    };
  }

  // 3. Read Page / Read Current Field / Scroll
  if (/^(?:read this page|read page|summarize page|describe page|where am i)$/i.test(lower)) {
    return {
      intent: "read_page",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (/^(?:read (?:the )?(?:current )?field|what is in this field|read field)$/i.test(lower)) {
    return {
      intent: "read_current_field",
      validForContext: true,
      spokenResponse: "",
    };
  }

  if (/^(?:scroll down|page down|move down)$/i.test(lower)) {
    return {
      intent: "scroll",
      scrollDirection: "down",
      validForContext: true,
      spokenResponse: "Scrolled down.",
    };
  }

  if (/^(?:scroll up|page up|move up)$/i.test(lower)) {
    return {
      intent: "scroll",
      scrollDirection: "up",
      validForContext: true,
      spokenResponse: "Scrolled up.",
    };
  }

  // 4. Go Back & Notifications
  if (/^(?:go back|previous page|back)$/i.test(lower)) {
    return {
      intent: "go_back",
      validForContext: true,
      spokenResponse: "Going back.",
    };
  }

  if (/^(?:(?:open|show|read|check)\s+)?notifications?$/i.test(lower)) {
    return {
      intent: "open_notifications",
      validForContext: true,
      spokenResponse: ctx.isAuthenticated
        ? "Opening spoken notifications and status summary."
        : "Please sign in first to check account notifications.",
    };
  }

  // 5. Blind Profile Wake/Selection on onboarding/registration
  if (
    /^(?:blind|i am blind|im blind|select blind|choose blind|blind mode|blind profile|voxonix blind|activate blind)$/i.test(
      lower,
    )
  ) {
    return {
      intent: "select_blind",
      validForContext: true,
      spokenResponse:
        "Blind and Low Vision mode selected. Please spell your first name by saying each letter separately.",
    };
  }

  // 6. Context-Aware Form Commands (/register & /login)
  if (/^(?:enter|set|fill)\s+(?:my\s+)?name$/i.test(lower)) {
    if (!isRegister) {
      return {
        intent: "enter_name",
        validForContext: false,
        spokenResponse: "Name entry is available on the registration page.",
      };
    }
    return {
      intent: "enter_name",
      validForContext: true,
      spokenResponse:
        "Ready to spell your name. Please spell your first name by saying each letter separately.",
    };
  }

  if (/^(?:change|edit|reset|clear)\s+(?:my\s+)?name$/i.test(lower)) {
    if (!isRegister) {
      return {
        intent: "change_name",
        validForContext: false,
        spokenResponse: "You can change your name on the registration or profile page.",
      };
    }
    return {
      intent: "change_name",
      validForContext: true,
      spokenResponse:
        "Cleared name. Please spell your first name by saying each letter separately.",
    };
  }

  if (/^(?:enter|set|fill)\s+(?:my\s+)?email(?:\s+address)?$/i.test(lower)) {
    if (!isRegister && !isLogin) {
      return {
        intent: "enter_email",
        validForContext: false,
        spokenResponse: "Email entry is available on the registration and sign in pages.",
      };
    }
    return {
      intent: "enter_email",
      validForContext: true,
      spokenResponse:
        "Ready to spell your email address. Please spell the part before the at sign by saying each letter separately.",
    };
  }

  if (/^(?:change|edit|reset|clear)\s+(?:my\s+)?email(?:\s+address)?$/i.test(lower)) {
    if (!isRegister && !isLogin) {
      return {
        intent: "change_email",
        validForContext: false,
        spokenResponse: "You can change your email on the registration or sign in page.",
      };
    }
    return {
      intent: "change_email",
      validForContext: true,
      spokenResponse:
        "Cleared email. Please spell the part before the at sign by saying each letter separately.",
    };
  }

  if (/^(?:change|edit|reset|clear)\s+(?:my\s+)?password$/i.test(lower)) {
    if (!isRegister) {
      return {
        intent: "change_password",
        validForContext: false,
        spokenResponse: "You can change your password field during registration.",
      };
    }
    return {
      intent: "change_password",
      validForContext: true,
      spokenResponse:
        "Cleared password fields. Please dictate your password in short chunks and say done or next when finished.",
    };
  }

  if (/^(?:enter|type|speak)\s+(?:my\s+)?password$/i.test(lower)) {
    if (!isRegister && !isLogin) {
      return {
        intent: "enter_password_guidance",
        validForContext: false,
        spokenResponse: "Password entry is available on registration and sign in.",
      };
    }
    return {
      intent: "enter_password_guidance",
      validForContext: true,
      spokenResponse:
        "Focused the masked password field. Dictate your password in short chunks using capital or small letters, numbers, and symbol names, then say next or done. Passwords are never spoken aloud.",
    };
  }

  if (/^(?:continue|next|next step)$/i.test(lower)) {
    if (!isRegister && !isLogin) {
      return {
        intent: "continue_step",
        validForContext: false,
        spokenResponse: "No multi-step form is active on this page.",
      };
    }
    return {
      intent: "continue_step",
      validForContext: true,
      spokenResponse: "Moving to the next step.",
    };
  }

  if (
    isLogin &&
    /^(?:(?:please|ok|okay|yes|yeah|yep|alright)\s+)?(?:sign\s*in(?:\s+(?:now|please|to\s+my\s+account))?|signin(?:\s+(?:now|please))?|log\s*in(?:\s+(?:now|please|to\s+my\s+account))?|login(?:\s+(?:now|please))?|log\s+me\s+in(?:\s+(?:now|please))?|sign\s+me\s+in(?:\s+(?:now|please))?|submit(?:\s+(?:login|sign\s*in|(?:the\s+)?form))?(?:\s+(?:now|please))?)$/i.test(
      lower,
    )
  ) {
    return {
      intent: "submit",
      validForContext: true,
      requiresConfirmation: false,
      spokenResponse: "Signing you in now.",
    };
  }

  if (
    /^(?:submit|submit registration|submit (?:the )?form|create (?:my )?account(?:\s+and\s+submit)?|submit\s+and\s+create\s+(?:my )?account|sign me in|submit login)$/i.test(
      lower,
    )
  ) {
    if (isRegister) {
      return {
        intent: "submit",
        validForContext: true,
        requiresConfirmation: true,
        confirmationPrompt:
          "Ready to create your VOXONIX account. Say confirm to submit or cancel to stay on this page.",
        spokenResponse: "Ready to create your VOXONIX account. Say confirm to submit or cancel.",
      };
    }
    return {
      intent: "submit",
      validForContext: false,
      spokenResponse: "Form submission is only available on the registration or sign in page.",
    };
  }

  // 8. Consequential Account & Call Actions
  if (/^(?:log out|logout|sign out|signout)$/i.test(lower)) {
    if (!ctx.isAuthenticated) {
      return {
        intent: "logout",
        validForContext: false,
        spokenResponse: "You are not signed in right now.",
      };
    }
    return {
      intent: "logout",
      validForContext: true,
      requiresConfirmation: true,
      confirmationPrompt: "Are you sure you want to log out? Say confirm or cancel.",
      spokenResponse: "Are you sure you want to log out? Say confirm or cancel.",
    };
  }

  if (/^(?:end (?:a |the )?call|leave (?:the )?call|hang up|exit call)$/i.test(lower)) {
    if (!isInCall) {
      return {
        intent: "end_call",
        validForContext: false,
        spokenResponse: "You are not currently in an active call.",
      };
    }
    return {
      intent: "end_call",
      callAction: "leave_call",
      validForContext: true,
      requiresConfirmation: true,
      confirmationPrompt: "Are you sure you want to end the call? Say confirm or cancel.",
      spokenResponse: "Are you sure you want to end the call? Say confirm or cancel.",
    };
  }

  if (/^(?:start (?:a |new )?call|make a call|new call|create call)$/i.test(lower)) {
    if (!ctx.isAuthenticated) {
      return {
        intent: "start_call",
        validForContext: false,
        spokenResponse: "Please sign in before starting a call.",
      };
    }
    return {
      intent: "start_call",
      validForContext: true,
      spokenResponse: "Starting a new call room.",
    };
  }

  // 9. In-Call Controls
  if (isInCall) {
    if (/^(?:mute|mute mic|mute microphone|silence mic)$/i.test(lower)) {
      return {
        intent: "mute_mic",
        callAction: "mute_mic",
        validForContext: true,
        spokenResponse: "Muting your microphone.",
      };
    }
    if (/^(?:unmute|unmute mic|unmute microphone|turn on mic)$/i.test(lower)) {
      return {
        intent: "unmute_mic",
        callAction: "unmute_mic",
        validForContext: true,
        spokenResponse: "Unmuting your microphone.",
      };
    }
    if (/^(?:toggle camera|turn off camera|turn on camera|camera)$/i.test(lower)) {
      return {
        intent: "toggle_camera",
        callAction: "toggle_camera",
        validForContext: true,
        spokenResponse: "Toggling camera.",
      };
    }
    if (/^(?:read messages|read captions|last message)$/i.test(lower)) {
      return {
        intent: "read_messages",
        callAction: "read_messages",
        validForContext: true,
        spokenResponse: "Reading recent messages.",
      };
    }
  }

  // 10. Whitelisted Route Navigation
  for (const entry of ROUTE_MATCHERS) {
    if (entry.pattern.test(lower)) {
      if (!ALLOWED_ROUTES.has(entry.route)) {
        return {
          intent: "unknown",
          validForContext: false,
          spokenResponse: "That destination is not allowed.",
        };
      }
      if (
        (entry.route === "/dashboard" ||
          entry.route === "/profile" ||
          entry.route === "/settings") &&
        ctx.isAuthenticated === false
      ) {
        return {
          intent: "navigate",
          targetRoute: entry.route,
          validForContext: false,
          spokenResponse: `Please sign in before opening ${entry.route.slice(1)}.`,
        };
      }
      return {
        intent: "navigate",
        targetRoute: entry.route,
        validForContext: true,
        spokenResponse: entry.spoken,
      };
    }
  }

  return {
    intent: "unknown",
    validForContext: false,
    spokenResponse: `Unrecognized command: ${cleaned}. Say read this page, go to dashboard, open settings, or repeat.`,
  };
}
