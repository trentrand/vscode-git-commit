const vscode = require('vscode');

// Used for referencing the extension, for example, when retrieving the configuration
const EXTENSION_IDENTIFIER = 'git-commit';

/**
 * Lifecycle
 */
exports.activate = async function activate(extensionContext) {
  // Format the commit message subject (e.g. `[CMS-25054] Subject text`)
  if (getConfiguration('subjectFormat.enableFormatter')) {
    await formatCommitSubject();
  }

  // Set the cursor selection to the end of the commit subject
  if (getConfiguration('autoselectEndOfSubject')) {
    setSelectionToEol(0);
  }

  // On each document change, if applicable, update the "characters remaining" count
  vscode.workspace.onDidChangeTextDocument(event => {
    const textEditor = vscode.window.activeTextEditor;
    if (textEditor && event.document === textEditor.document) {
      if (getConfiguration('subjectFormat.displayCharactersRemaining')) {
        updateMaxLengthDecoration();
      }
    }
  }, null, extensionContext.subscriptions);

}

/**
 * Utilities
 */

function getConfiguration(identifier) {
  return vscode.workspace.getConfiguration(EXTENSION_IDENTIFIER).get(identifier);
}

function getCwd(document) {
  const separatorIndex = document.fileName.lastIndexOf('/');
  return document.fileName.substring(0, separatorIndex);
}

async function getBranchName(cwd) {
  return new Promise((resolve, reject) => {
    require('simple-git')(cwd).branchLocal((error, data) => {
      if (error) {
        reject(error);
      } else {
        resolve(data.current);
      }
    })
  });
}

function validateSubjectFormat(subjectText) {
  return new RegExp(getConfiguration('subjectFormat.linterRegex')).test(subjectText);
}

// Create the max length decorator type, indicating the characters remaining
// before the commit subject's max length is met
function generateMaxLengthDecorationType(maxLength, lineLength) {
  return vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${maxLength - lineLength} characters remaining`,
      color: getConfiguration('subjectFormat.charactersRemainingTextColor'),
      margin: '0 0 0 2em',
    }
  });
}

/**
 * Commands
 */

// Sets the selection (caret position) to the end of the specified line
function setSelectionToEol(lineNum) {
  const textEditor = vscode.window.activeTextEditor;
  const line = textEditor.document.lineAt(new vscode.Position(lineNum, 0));
  const positionEol = new vscode.Position(lineNum, line.range.end.character);
  textEditor.selection = new vscode.Selection(positionEol, positionEol);
}

// Lint and format the commit subject
async function formatCommitSubject() {
  const textEditor = vscode.window.activeTextEditor;
  const document = textEditor.document;
  const cwd = getCwd(document);

  // Extract the git commit subject from the first line of the document
  const subjectLine = document.lineAt(new vscode.Position(0, 0));
  let subjectText = subjectLine.text;

  // Prevent an already-formated commit subject from being reformatted; useful
  // for when, for example, the user is amending or editing a commit message
  if (!validateSubjectFormat(subjectText)) {
    // Retrieve data points from branch name
    const branchName = await getBranchName(cwd);
    const branchRegex = new RegExp(getConfiguration('subjectFormat.branchRegex'), 'g');
    const branchDataPoints = (branchName.match(branchRegex) || []).map(e => e.replace(branchRegex, '$1'));

    subjectText = getConfiguration('subjectFormat.template');
    placeholders = subjectText.match(/\$\d+/g);

    // Fill placeholder data points with the groups captured from branch name
    for (const [i, placeholder] of placeholders.entries()) {
      subjectText = subjectText.replace(placeholder, branchDataPoints[i] || '');
    }

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, subjectLine.range.start, subjectText);
    await vscode.workspace.applyEdit(edit)

    if (getConfiguration('subjectFormat.displayCharactersRemaining')) {
      updateMaxLengthDecoration();
    }
  }
}

// Present and update a decoration that indicates the amount of characters
// remaining before the git subject's max length is met
function updateMaxLengthDecoration() {
  const textEditor = vscode.window.activeTextEditor;
  if (!textEditor) {
    return;
  }
  const document = textEditor.document;
  const subjectMaxLength = getConfiguration('subjectFormat.maxLength');
  const subjectLine = document.lineAt(new vscode.Position(0, 0));
  const decorations = [{
    range: new vscode.Range(subjectLine.range.start, subjectLine.range.end)
  }];
  // Dispose previous max length decoration type, if it exists
  if (this.maxLengthDecorationType) {
    this.maxLengthDecorationType.dispose();
  }
  if (subjectLine.text.length !== 0) {
    // Generate and globally store reference to new max length decoration type
    this.maxLengthDecorationType = generateMaxLengthDecorationType(subjectMaxLength, subjectLine.text.length);
    textEditor.setDecorations(this.maxLengthDecorationType, decorations);
  }
}