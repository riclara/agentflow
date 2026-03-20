import {
  checkbox,
  confirm,
  input,
  select,
  Separator,
} from "@inquirer/prompts";

export interface PromptContext {
  nonInteractive?: boolean;
}

export interface SelectChoice<T extends string> {
  name: string;
  value: T;
  description?: string;
  disabled?: boolean | string;
}

export interface CheckboxChoice<T extends string> extends SelectChoice<T> {
  checked?: boolean;
}

export async function promptConfirm(
  message: string,
  defaultValue: boolean,
  context: PromptContext = {},
): Promise<boolean> {
  if (context.nonInteractive) {
    return defaultValue;
  }

  return confirm({
    message,
    default: defaultValue,
  });
}

export async function promptInput(
  message: string,
  defaultValue: string,
  context: PromptContext = {},
): Promise<string> {
  if (context.nonInteractive) {
    return defaultValue;
  }

  return input({
    message,
    default: defaultValue,
  });
}

export async function promptSelect<T extends string>(
  message: string,
  choices: Array<SelectChoice<T> | Separator>,
  defaultValue: T,
  context: PromptContext = {},
): Promise<T> {
  if (context.nonInteractive) {
    return defaultValue;
  }

  return select<T>({
    message,
    choices,
    default: defaultValue,
  });
}

export async function promptCheckbox<T extends string>(
  message: string,
  choices: Array<CheckboxChoice<T> | Separator>,
  defaultValues: T[],
  context: PromptContext = {},
): Promise<T[]> {
  if (context.nonInteractive) {
    return [...defaultValues];
  }

  return checkbox<T>({
    message,
    choices,
  });
}
