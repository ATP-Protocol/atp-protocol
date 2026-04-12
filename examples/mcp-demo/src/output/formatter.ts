/**
 * Demo Output Formatter
 *
 * Beautiful, colored terminal output showing the ATP governance pipeline.
 */

export enum Color {
  Reset = "\x1b[0m",
  Bright = "\x1b[1m",
  Dim = "\x1b[2m",

  FgGreen = "\x1b[32m",
  FgYellow = "\x1b[33m",
  FgCyan = "\x1b[36m",
  FgRed = "\x1b[31m",
  FgMagenta = "\x1b[35m",
  FgGray = "\x1b[90m",

  BgBlue = "\x1b[44m",
  BgGreen = "\x1b[42m",
  BgRed = "\x1b[41m",
  BgGray = "\x1b[100m",
}

export class Formatter {
  static header(text: string): string {
    return `\n${Color.BgBlue}${Color.Bright} ${text} ${Color.Reset}`;
  }

  static section(text: string): string {
    return `\n${Color.Bright}${Color.FgCyan}▸ ${text}${Color.Reset}`;
  }

  static scenario(title: string, description: string): string {
    return `\n${Color.Bright}${Color.FgMagenta}📋 Scenario: ${title}${Color.Reset}\n   ${Color.FgGray}${description}${Color.Reset}`;
  }

  static step(name: string, result: boolean | "pending", detail?: string): string {
    let icon: string;
    let color: Color;

    if (result === true) {
      icon = "✓";
      color = Color.FgGreen;
    } else if (result === false) {
      icon = "✗";
      color = Color.FgRed;
    } else {
      icon = "⏳";
      color = Color.FgYellow;
    }

    const detail_str = detail ? ` ${Color.FgGray}(${detail})${Color.Reset}` : "";
    return `   ${color}${icon}${Color.Reset} ${Color.Bright}${name}${Color.Reset}${detail_str}`;
  }

  static outcome(success: boolean, message: string, evidenceId?: string): string {
    const icon = success ? "✓" : "✗";
    const color = success ? Color.FgGreen : Color.FgRed;
    const status = success ? "SUCCESS" : "DENIED";

    let result = `\n   ${color}${Color.Bright}${icon} ${status}${Color.Reset}`;
    if (message) {
      result += `\n   ${Color.FgGray}${message}${Color.Reset}`;
    }
    if (evidenceId) {
      result += `\n   ${Color.Dim}Evidence ID: ${evidenceId}${Color.Reset}`;
    }
    return result;
  }

  static approval(state: string, approvalId?: string): string {
    let icon = "⏳";
    let color = Color.FgYellow;

    if (state === "PENDING_REVIEW") {
      icon = "⏳";
      color = Color.FgYellow;
    }

    const aid = approvalId ? ` ${Color.FgGray}(${approvalId})${Color.Reset}` : "";
    return `   ${color}${icon}${Color.Reset} ${Color.Bright}Approval Required${Color.Reset}${aid}`;
  }

  static table(
    headers: string[],
    rows: (string | number)[][]
  ): string {
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => String(r[i] || "").length))
    );

    const separator = "   " + colWidths.map(w => "─".repeat(w + 2)).join("┼");
    const headerRow =
      "   " +
      headers
        .map((h, i) => `${Color.Bright}${h.padEnd(colWidths[i])}${Color.Reset}`)
        .join(" │ ");

    const dataRows = rows.map(
      row =>
        "   " +
        row
          .map((cell, i) => String(cell).padEnd(colWidths[i]))
          .join(" │ ")
    );

    return `\n${separator}\n${headerRow}\n${separator}\n${dataRows.join(
      "\n"
    )}\n${separator}`;
  }

  static box(title: string, lines: string[]): string {
    const width = Math.max(title.length, ...lines.map(l => l.length)) + 4;
    const border = "─".repeat(width);

    let result = `\n   ${Color.FgGray}┌${border}┐${Color.Reset}\n`;
    result += `   ${Color.FgGray}│${Color.Reset} ${Color.Bright}${title.padEnd(width - 2)}${Color.Reset} ${Color.FgGray}│${Color.Reset}\n`;
    result += `   ${Color.FgGray}├${border}┤${Color.Reset}\n`;

    lines.forEach(line => {
      result += `   ${Color.FgGray}│${Color.Reset} ${line.padEnd(width - 2)} ${Color.FgGray}│${Color.Reset}\n`;
    });

    result += `   ${Color.FgGray}└${border}┘${Color.Reset}`;

    return result;
  }

  static summary(total: number, passed: number, denied: number, pending: number): string {
    const lines = [
      `Total Scenarios:  ${Color.Bright}${total}${Color.Reset}`,
      `${Color.FgGreen}✓ Passed${Color.Reset}:        ${Color.FgGreen}${passed}${Color.Reset}`,
      `${Color.FgRed}✗ Denied${Color.Reset}:        ${Color.FgRed}${denied}${Color.Reset}`,
      `${Color.FgYellow}⏳ Pending${Color.Reset}:       ${Color.FgYellow}${pending}${Color.Reset}`,
    ];

    return Formatter.box("EXECUTION SUMMARY", lines);
  }
}
