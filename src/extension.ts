import * as vscode from "vscode"
import { OBSWebSocket, OBSWebSocketError } from "obs-websocket-js"

class OBSControlViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView
  private obs: OBSWebSocket
  private logger: vscode.OutputChannel
  private status = {
    connected: false,
    currentScene: "",
    streaming: false,
    recording: false,
  }

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.obs = new OBSWebSocket()
    this.logger = vscode.window.createOutputChannel("OBS Status")

    this.obs.on("CurrentProgramSceneChanged", ({ sceneName }) => {
      this.status.currentScene = sceneName
      this._updateView()
    })

    this.obs.on("StreamStateChanged", ({ outputActive }) => {
      this.status.streaming = outputActive
      this._updateView()
    })

    this.obs.on("RecordStateChanged", ({ outputActive }) => {
      this.status.recording = outputActive
      this._updateView()
    })
  }

  public async connect() {
    try {
      const config = vscode.workspace.getConfiguration("obsControl")
      const url = config.get<string>("host") || "ws://localhost:4455"
      const password = config.get<string>("password")

      const { obsWebSocketVersion, negotiatedRpcVersion } =
        await this.obs.connect(url, password, {
          eventSubscriptions: 1,
        })
      console.log(
        `Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`,
      )

      this.logger.appendLine("Successfully connected to OBS")
      this.status.connected = true

      this.obs.on("ConnectionClosed", () => {
        this.status.connected = false
        this._updateView()
      })

      // Get initial states.
      const sceneInfo = await this.obs.call("GetCurrentProgramScene")
      this.status.currentScene = sceneInfo.currentProgramSceneName

      const streamInfo = await this.obs.call("GetStreamStatus")
      this.status.streaming = streamInfo.outputActive

      const recordingInfo = await this.obs.call("GetRecordStatus")
      this.status.recording = recordingInfo.outputActive

      this._updateView()
      vscode.window.showInformationMessage("Connected to OBS")
    } catch (err: unknown) {
      this.status.connected = false
      this._updateView()

      if (err instanceof OBSWebSocketError) {
        vscode.window.showErrorMessage(
          `Failed to connect to OBS: ${err.message} (Code: ${err.code})`,
        )
      } else {
        vscode.window.showErrorMessage(
          `Failed to connect to OBS: ${String(err)}`,
        )
      }
    }
  }

  public async disconnect() {
    if (this.status.connected) {
      await this.obs.disconnect()
      this.status.connected = false
      this._updateView()
    }
  }

  private _updateView() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview)
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Thenable<void> | void {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    }

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "startRecording":
          this.startRecording()
          break
        case "stopRecording":
          this.stopRecording()
          break
        case "startStreaming":
          break
        case "stopStreaming":
          break
      }
    })

    this.connect()

    this._updateView()
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Fetch resource paths.
    const extensionUri = this._extensionUri
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css",
      ),
    )

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <style>
          .status-container { 
          padding-top: 7px; }

          .status-section {
            display: flex;
            justify-content: space-between;
            line-height: 1.5;
          }

          .status-section h2 {
            margin: 0;
            font-size: 11px;
            font-weight: 400;
            color: var(--vscode-descriptionForeground);
          }

          .status-section span {
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <div class="status-container">
          <div class="status-section">
            <h2>Scene</h2>
            <span>${this.status.currentScene}</span>
          </div>
          <div class="status-section">
            <h2>Streaming</h2>
            <span>${this.status.streaming ? "On" : "Off"}</span>
          </div>
          <div class="status-section">
            <h2>Recording</h2>
            <span>${this.status.recording ? "On" : "Off"}</span>
          </div>
        </div>
      </body>
      </html>
    `
  }

  // Commands
  public async startRecording() {
    try {
      if (!this.status.connected) {
        vscode.window.showErrorMessage("Not connected to OBS")
      }
      await this.obs.call("StartRecord")
      this.logger.appendLine("Recording started.")
    } catch (err: unknown) {
      const message = `Failed to start recording: ${String(err)}`
      this.logger.appendLine(message)
      vscode.window.showErrorMessage(message)
    }
  }

  public async stopRecording() {
    try {
      if (!this.status.connected) {
        vscode.window.showErrorMessage("Not connected to OBS")
      }
      await this.obs.call("StopRecord")
      this.logger.appendLine("Recording stopped.")
    } catch (err: unknown) {
      const message = `Failed to stop recording: ${String(err)}`
      this.logger.appendLine(message)
      vscode.window.showErrorMessage(message)
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new OBSControlViewProvider(context.extensionUri)

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "obsControl.statusView",
      provider,
    ),

    vscode.commands.registerCommand("obsControl.startRecording", () =>
      provider.startRecording(),
    ),
    vscode.commands.registerCommand("obsControl.stopRecording", () =>
      provider.stopRecording(),
    ),
  )
}

export function deactivate() {}
