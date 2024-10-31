import { MarkdownView, Plugin, Editor, Notice } from "obsidian";
import {
  DEFAULT_SETTINGS,
  TasksToOmnifocusSettings,
  TasksToOmnifocusSettingTab,
} from "./settings";

import { processTasks } from "./rules";

// A task is recognised by (numbers indicate capture groups):
//   - (1) zero or more spaces at the start of a line, followed by
//   - (2) a bullet point (- or *), then
//   - one or more spaces,
//   - a checkbox [ ] (containing exactly 1 space),
//   - one or more spaces,
//   - (3) zero or more non-space characters to the end of the line,
//   - (4) optionally followed by zero or more lines starting with the same number of spaces as the first line,
//     plus at least one extra space, followed by a bullet point and text to the end of the line.
//     Repeats until the indentation level returns to the original level, or the end of the text.
// https://regex101.com/r/BI6S5W/1
const TASK_REGEX =
  /^([ \t]*)([-*])\s+\[ \]\s+(.*)([\n]+(?:\1[ \t]+[-*]\s+[^[].*[\n\r]*)*)?/gm;

export default class TasksToOmnifocus extends Plugin {
  settings: TasksToOmnifocusSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "extract-tasks",
      name: "Extract Tasks Into OmniFocus",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.addToOmnifocus(false, editor, view);
      },
    });

    this.addCommand({
      id: "extract-tasks-selection",
      name: "Extract Tasks from selection Into OmniFocus",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.addToOmnifocus(true, editor, view);
      },
    });

    this.addSettingTab(new TasksToOmnifocusSettingTab(this.app, this));
  }

  async addToOmnifocus(
    isSelection: boolean,
    editor: Editor,
    view: MarkdownView
  ) {
    let editorText: string;
    if (isSelection) {
      editorText = editor.getSelection();
    } else {
      editorText = editor.getValue();
    }

    try {
      const matches = editorText.matchAll(TASK_REGEX);
      const tasks: string[] = [];
      for (const match of matches) {
        let taskText = match[3];
        if (match[4]) {
          const noteRegex = new RegExp(`^${match[1]}[ \t]{1}`, "gm");
          const taskNote = match[4].replace(noteRegex, "");
          taskText += String.fromCharCode(31) + taskNote;
        }
        tasks.push(taskText.trim());
      }
      if (tasks.length === 0) {
        console.warn("No tasks found in the selected text.");
        new Notice("No tasks found in the selected text.");
        return;
      }

      const fileURL = encodeURIComponent(view.file.path);
      const vaultName = encodeURIComponent(this.app.vault.getName());
      const baseNote = `obsidian://open?vault=${vaultName}&file=${fileURL}\n`;

      const omnifocusURLs = processTasks(tasks, baseNote, view);
      omnifocusURLs.forEach((url) => {
        console.debug(`Opening URL: ${url}`);
        window.open(url);
      });

      if (this.settings.markComplete) {
        const completedText = editorText.replace(TASK_REGEX, "$1$2 [x] $3$4");
        if (isSelection) {
          editor.replaceSelection(completedText);
        } else {
          editor.setValue(completedText);
        }
      }
    } catch (err) {
      console.error("Error extracting tasks", err);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {}

  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
}
