import { MarkdownView } from "obsidian";

interface TaskFields {
  name: string;
  note: string;
  due: string;
  [key: string]: string; // Add index signature
}

type HandlerFunction = (
  match: RegExpMatchArray,
  taskFields: TaskFields,
  view: MarkdownView
) => TaskFields;

interface RegexRule {
  regex: RegExp;
  handler: HandlerFunction;
}

const DATE_REGEX = /([/]{2}\s*)(\d{4}[-/]\d{2}[-/]\d{2})\s?/g;
const SHORT_DATE_REGEX = /([/]{2}\s*)(((next|last)\s)?\w+)\s?/gi;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;
const DATAVIEW_META_REGEX = /(\s?\[(\w+)::\s*([^\]]+)\])/g;
const TAGS_REGEX = /(\s?#([a-z]\w*))/gi;

// Note: The order the rules are applied is important.
const regexRules: RegexRule[] = [
  // First rule is to make markdown links plain text in the task name,
  // and add the link URL to the task note.
  {
    regex: MARKDOWN_LINK_REGEX,
    handler: (match, taskFields) => {
      const [fullMatch, linkText, url] = match;
      taskFields.name = taskFields.name.replace(fullMatch, linkText);
      taskFields.note += `${linkText}: ${url}\n`;
      return taskFields;
    },
  },

  // Next, we process [[WikiLinks]] in a similar way to above, but we
  // construct a link back to Obsidian instead of a web URL.
  {
    regex: WIKILINK_REGEX,
    handler: (match, taskFields, view) => {
      const matchDetails = match[0].match(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/);
      if (matchDetails) {
        const fileName = matchDetails[1];
        const alias = matchDetails[3] || fileName;
        const fileURL = encodeURIComponent(`${fileName}.md`);
        const vaultName = encodeURIComponent(view.app.vault.getName());
        const obsidianURL = `obsidian://open?vault=${vaultName}&file=${fileURL}`;
        taskFields.note += `${alias}: ${obsidianURL}\n`;
        taskFields.name = taskFields.name.replace(match[0], alias);
      }
      return taskFields;
    },
  },

  // Next, we process due dates. We have two rules for this. The first
  // one is for dates in the format YYYY-MM-DD...
  {
    regex: DATE_REGEX,
    handler: (match, taskFields) => {
      taskFields.due = match[2];
      taskFields.name = taskFields.name.replace(match[0], "");
      return taskFields;
    },
  },

  // ...and the second one is for dates like "today", "next week", etc.
  // OmniFocus will also accept 3-letter day/month codes (e.g. Tue, Aug)
  // as well as full day/month names (e.g. Tuesday, August).
  {
    regex: SHORT_DATE_REGEX,
    handler: (match, taskFields) => {
      taskFields.due = match[2];
      taskFields.name = taskFields.name.replace(match[1], "");
      return taskFields;
    },
  },

  // Process DataView meta data. These are in the format [key:: value].
  // We remove the meta data from task name and add it as a field. Expect to
  // have only 1 value (a string) per meta data field.
  {
    regex: DATAVIEW_META_REGEX,
    handler: (match, taskFields) => {
      if (match.length >= 4 && match[2] && match[3]) {
        taskFields[match[2]] = match[3];
      }
      taskFields.name = taskFields.name.replace(match[0], "");
      return taskFields;
    },
  },

  // Process tags last. These are in the format #tag. Tags become Contexts in
  // OmniFocus. Expect zero or more tags.
  {
    regex: TAGS_REGEX,
    handler: (match, taskFields) => {
      if (match.length >= 3 && match[2]) {
        if (taskFields.context) {
          taskFields.context += "," + match[2];
        } else {
          taskFields.context = match[2];
        }
      }
      taskFields.name = taskFields.name.replace(match[0], "");
      return taskFields;
    },
  },
];

function applyRegexRule(
  taskFields: TaskFields,
  regex: RegExp,
  handler: HandlerFunction,
  view: MarkdownView
): TaskFields {
  const matches = [...taskFields.name.matchAll(regex)];
  for (const match of matches) {
    taskFields = handler(match, taskFields, view);
  }
  return taskFields;
}

function encodeTaskFields(taskFields: TaskFields): string {
  return Object.entries(taskFields)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

function cleanTaskNoteText(note: string, baseNote: string): string {
  // Convert Markdown links to plain text
  note = note.replace(MARKDOWN_LINK_REGEX, "$1 <$2>");
  return note.trim() + "\n\n" + baseNote;
}

export function processTasks(
  tasks: string[],
  baseNote: string,
  view: MarkdownView
): string[] {
  return tasks.map((task) => {
    const taskUnits = task.split(String.fromCharCode(31));
    let taskFields: TaskFields = {
      name: taskUnits[0],
      note: taskUnits.length > 1 ? taskUnits[1].trimEnd() + "\n\n" : "",
      due: "",
    };

    for (const rule of regexRules) {
      taskFields = applyRegexRule(taskFields, rule.regex, rule.handler, view);
    }
    taskFields.note = cleanTaskNoteText(taskFields.note, baseNote);

    // For each object in `taskFields`, we want to encode the values
    // and concatenate them into a URL string.
    const encodedUrl = "omnifocus:///add?" + encodeTaskFields(taskFields);
    return encodedUrl;
  });
}
