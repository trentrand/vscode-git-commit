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

/**
 * Commands
 */

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
    vscode.workspace.applyEdit(edit)
  }
}