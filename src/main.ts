import { MarkdownView, Plugin, Editor, Notice } from "obsidian";
import {
  DEFAULT_SETTINGS,
  TasksToOmnifocusSettings,
  TasksToOmnifocusSettingTab,
} from "./settings";

import { processTasks } from "./rules";

const TASK_REGEX = /([-*]) \[ \] (.*)/g;

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
        tasks.push(match[2]); // Extract task details without prefix ("- [ ]")
      }
      if (tasks.length === 0) {
        console.warn("No tasks found in the selected text.");
        new Notice("No tasks found in the selected text.");
        return;
      }

      const fileURL = encodeURIComponent(view.file.path);
      const vaultName = encodeURIComponent(this.app.vault.getName());
      const baseNote = `obsidian://open?vault=${vaultName}&file=${fileURL}\n\n`;

      const omnifocusURLs = processTasks(tasks, baseNote, view);
      omnifocusURLs.forEach((url) => {
        console.debug(`Opening URL: ${url}`);
        window.open(url);
      });

      if (this.settings.markComplete) {
        const completedText = editorText.replace(TASK_REGEX, "$1 [x] $2");
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
