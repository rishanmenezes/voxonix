import type { STTProvider, STTConfig, STTState, TranscriptResult, STTTelemetry } from "./types";
import { BrowserSpeechRecognitionProvider } from "./browser-stt-provider";
import { ServerStreamingSTTProvider } from "./server-streaming-stt-provider";
import type { SignalingBroker } from "@/lib/webrtc/signaling";

export type STTSystemState =
  | "DISABLED"
  | "STARTING"
  | "SERVER_ACTIVE"
  | "SERVER_RECONNECTING"
  | "SERVER_FAILED"
  | "BROWSER_FALLBACK";

export interface STTManagerProps {
  signaling: SignalingBroker;
  getAudioTrack: () => MediaStreamTrack | null;
  onTranscript: (result: TranscriptResult) => void;
  onError?: (error: Error) => void;
  onStateChange?: (systemState: STTSystemState) => void;
  onTelemetry?: (telemetry: STTTelemetry) => void;
}

export class STTFallbackStateMachine {
  private systemState: STTSystemState = "DISABLED";
  private serverProvider: ServerStreamingSTTProvider | null = null;
  private browserProvider: BrowserSpeechRecognitionProvider | null = null;
  private activeProvider: STTProvider | null = null;

  private serverSTTAvailable = false;
  private isShouldListen = false;
  private config: STTConfig = { language: "en-US", continuous: true, interimResults: true };

  private unsubs: Array<() => void> = [];

  constructor(private readonly props: STTManagerProps) {
    this.initProviders();
    this.listenToSignaling();
  }

  private initProviders() {
    this.serverProvider = new ServerStreamingSTTProvider(
      this.props.signaling,
      this.props.getAudioTrack,
    );
    this.browserProvider = new BrowserSpeechRecognitionProvider();
  }

  private listenToSignaling() {
    this.props.signaling.setCallbacks({
      onSTTCapabilities: (data) => {
        console.log(
          `[STTStateMachine] Server STT capabilities: available=${data.available} provider=${data.provider}`,
        );
        this.serverSTTAvailable = data.available;
        if (this.isShouldListen && this.systemState !== "BROWSER_FALLBACK") {
          this.reconcileState();
        }
      },
    });
  }

  public getSystemState(): STTSystemState {
    return this.systemState;
  }

  public getActiveProvider(): STTProvider | null {
    return this.activeProvider;
  }

  public getTelemetry(): STTTelemetry | null {
    return this.activeProvider ? this.activeProvider.getTelemetry() : null;
  }

  private setSystemState(state: STTSystemState) {
    if (this.systemState === state) return;
    this.systemState = state;
    this.props.onStateChange?.(state);
  }

  private cleanupActiveSubscriptions() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  private attachProviderListeners(provider: STTProvider) {
    this.cleanupActiveSubscriptions();

    const uTranscript = provider.onTranscript((res) => {
      this.props.onTranscript(res);
    });

    const uError = provider.onError((err) => {
      console.warn(`[STTStateMachine] Error from active provider (${provider.id}):`, err);
      this.props.onError?.(err);

      // Controlled fallback: If server streaming fails, tear down server provider and fall back to browser STT
      if (provider === this.serverProvider && this.isShouldListen) {
        this.setSystemState("SERVER_FAILED");
        this.fallbackToBrowser();
      }
    });

    const uState = provider.onStateChange((st: STTState) => {
      if (provider === this.serverProvider) {
        if (st === "listening") this.setSystemState("SERVER_ACTIVE");
        else if (st === "paused") this.setSystemState("SERVER_RECONNECTING");
        else if (st === "error") this.setSystemState("SERVER_FAILED");
      } else if (provider === this.browserProvider) {
        if (st === "listening") this.setSystemState("BROWSER_FALLBACK");
      }
    });

    const uTel = provider.onTelemetry?.((tel) => {
      this.props.onTelemetry?.(tel);
    });

    this.unsubs.push(uTranscript, uError, uState);
    if (uTel) this.unsubs.push(uTel);
  }

  public async setShouldListen(shouldListen: boolean, config?: STTConfig): Promise<void> {
    this.isShouldListen = shouldListen;
    if (config) {
      this.config = { ...this.config, ...config };
    }
    await this.reconcileState();
  }

  private async reconcileState(): Promise<void> {
    if (!this.isShouldListen) {
      await this.stopAll();
      this.setSystemState("DISABLED");
      return;
    }

    this.setSystemState("STARTING");

    // Preferred provider: Server-side Deepgram Nova-3 if available, else BrowserSpeechRecognition
    if (this.serverSTTAvailable && this.serverProvider?.isSupported()) {
      await this.activateProvider(this.serverProvider);
    } else {
      await this.activateProvider(this.browserProvider!);
    }
  }

  private async activateProvider(target: STTProvider): Promise<void> {
    // Invariant: Fully stop existing active provider first (guarantee strictly 0 concurrent active recognizers)
    if (this.activeProvider && this.activeProvider !== target) {
      await this.activeProvider.stop();
      this.activeProvider = null;
    }

    this.activeProvider = target;
    this.attachProviderListeners(target);

    try {
      await target.start(this.config);
    } catch (err) {
      console.warn(`[STTStateMachine] Failed to start provider ${target.id}:`, err);
      if (target === this.serverProvider) {
        this.setSystemState("SERVER_FAILED");
        await this.fallbackToBrowser();
      }
    }
  }

  private async fallbackToBrowser(): Promise<void> {
    console.log(`[STTStateMachine] Initiating controlled fallback to BrowserSpeechRecognition`);
    if (this.serverProvider) {
      try {
        await this.serverProvider.stop();
      } catch {
        // ignore
      }
    }
    if (this.browserProvider && this.browserProvider.isSupported()) {
      await this.activateProvider(this.browserProvider);
    }
  }

  public async stopAll(): Promise<void> {
    this.cleanupActiveSubscriptions();
    if (this.serverProvider) {
      try {
        await this.serverProvider.stop();
      } catch {
        // ignore
      }
    }
    if (this.browserProvider) {
      try {
        await this.browserProvider.stop();
      } catch {
        // ignore
      }
    }
    this.activeProvider = null;
  }

  public destroy(): void {
    this.stopAll();
    this.serverProvider = null;
    this.browserProvider = null;
  }
}
