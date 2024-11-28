import * as vscode from "vscode"
import { OBSWebSocket } from "obs-websocket-js"

class OBSControlViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView
  private obs: OBSWebSocket

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.obs = new OBSWebSocket()
  }

  private _updateView() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview()
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

    this._updateView()
  }

  private _getHtmlForWebview() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
      </head>
      <body>
      </body>
      </html>
    `
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new OBSControlViewProvider(context.extensionUri)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("obsControl", provider),
  )
}

export function deactivate() {}
