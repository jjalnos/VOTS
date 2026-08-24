import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const CONNECTION_TIMEOUT_MS = 5_000;
const GREETING_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 10_000;
const APPROVED_SMTP_HOST = "smtp.elasticemail.com";
const APPROVED_SMTP_PORT = 2_525;
const APPROVED_SMTP_FROM = "no-reply@voicesoftheshoah.org";
const APPROVED_SMTP_USER_PATTERN =
  /^vots-smtp-[a-z\d]{8,32}@voicesoftheshoah\.org$/;

type SmtpEnvironment = Record<string, string | undefined>;

export interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string;
  password: string;
  from: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional branded HTML alternative; the text part is always present. */
  html?: string;
}

interface TransportEmailMessage extends EmailMessage {
  from: string;
}

export interface EmailTransport {
  sendMail(message: TransportEmailMessage): Promise<unknown>;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;
export type SmtpTransportFactory = (
  options: SMTPTransport.Options,
) => EmailTransport;

export class EmailConfigurationError extends Error {
  /**
   * Names the SMTP environment variable that failed validation, so an operator
   * can tell a bad username from a bad port. The value is never captured.
   */
  readonly variable: string;

  constructor(
    message = "SMTP email is not configured safely.",
    variable = "SMTP_CONFIGURATION",
  ) {
    super(message);
    this.name = "EmailConfigurationError";
    this.variable = variable;
  }
}

export class EmailDeliveryError extends Error {
  constructor() {
    super("The email could not be delivered.");
    this.name = "EmailDeliveryError";
  }
}

function requiredEnvironmentValue(
  environment: SmtpEnvironment,
  name: string,
): string {
  const value = environment[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EmailConfigurationError(undefined, name);
  }
  return value;
}

function configuredBoolean(
  environment: SmtpEnvironment,
  name: string,
): boolean {
  const value = requiredEnvironmentValue(environment, name);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new EmailConfigurationError(undefined, name);
}

function configuredPort(environment: SmtpEnvironment): number {
  const raw = requiredEnvironmentValue(environment, "SMTP_PORT");
  if (!/^\d{1,5}$/.test(raw)) throw new EmailConfigurationError(undefined, "SMTP_PORT");
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new EmailConfigurationError(undefined, "SMTP_PORT");
  }
  return port;
}

function isValidHostname(value: string): boolean {
  if (value.length > 253 || value.includes("..")) return false;
  return value.split(".").every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
  );
}

function isValidMailbox(value: string): boolean {
  if (value.length > 254 || /[\s<>()\[\],;:\\"]/.test(value)) return false;
  const separator = value.indexOf("@");
  if (
    separator <= 0 ||
    separator !== value.lastIndexOf("@") ||
    separator === value.length - 1
  ) {
    return false;
  }
  const localPart = value.slice(0, separator);
  const hostname = value.slice(separator + 1);
  return (
    localPart.length <= 64 &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..") &&
    /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart) &&
    isValidHostname(hostname)
  );
}

export function smtpConfigurationFromEnvironment(
  environment: SmtpEnvironment = process.env,
): SmtpConfiguration {
  const host = requiredEnvironmentValue(environment, "SMTP_HOST").trim();
  const secure = configuredBoolean(environment, "SMTP_SECURE");
  const requireTLS = configuredBoolean(environment, "SMTP_REQUIRE_TLS");
  const from = requiredEnvironmentValue(environment, "SMTP_FROM").trim();
  const user = requiredEnvironmentValue(environment, "SMTP_USER").trim();
  const port = configuredPort(environment);

  if (!isValidHostname(host) || host.toLocaleLowerCase("en") !== APPROVED_SMTP_HOST) {
    throw new EmailConfigurationError(undefined, "SMTP_HOST");
  }
  if (port !== APPROVED_SMTP_PORT) {
    throw new EmailConfigurationError(undefined, "SMTP_PORT");
  }
  if (!isValidMailbox(from) || from.toLocaleLowerCase("en") !== APPROVED_SMTP_FROM) {
    throw new EmailConfigurationError(undefined, "SMTP_FROM");
  }
  if (
    !isValidMailbox(user) ||
    !APPROVED_SMTP_USER_PATTERN.test(user.toLocaleLowerCase("en"))
  ) {
    throw new EmailConfigurationError(undefined, "SMTP_USER");
  }
  // This adapter is intentionally limited to Elastic Email's STARTTLS
  // endpoint. Allowing the hostname to drift would let an environment editor
  // relay the hidden credential to an attacker-controlled SMTP server.
  if (secure) throw new EmailConfigurationError(undefined, "SMTP_SECURE");
  if (!requireTLS) throw new EmailConfigurationError(undefined, "SMTP_REQUIRE_TLS");

  return {
    host: APPROVED_SMTP_HOST,
    port,
    secure,
    requireTLS,
    user: user.toLocaleLowerCase("en"),
    password: requiredEnvironmentValue(environment, "SMTP_PASSWORD"),
    from: APPROVED_SMTP_FROM,
  };
}

function smtpTransportOptions(
  configuration: SmtpConfiguration,
): SMTPTransport.Options {
  return {
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    requireTLS: configuration.requireTLS,
    auth: {
      user: configuration.user,
      pass: configuration.password,
    },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  };
}

export function createSmtpTransport(
  configuration: SmtpConfiguration,
  factory: SmtpTransportFactory = (options) => nodemailer.createTransport(options),
): EmailTransport {
  return factory(smtpTransportOptions(configuration));
}

function validateMessage(message: EmailMessage, from: string): void {
  if (
    !isValidMailbox(from) ||
    !isValidMailbox(message.to) ||
    message.subject.trim().length === 0 ||
    message.subject.length > 200 ||
    /[\r\n]/.test(message.subject) ||
    message.text.length === 0 ||
    message.text.length > 100_000 ||
    (message.html !== undefined &&
      (message.html.length === 0 || message.html.length > 200_000))
  ) {
    throw new EmailConfigurationError("The email message is invalid.");
  }
}

/**
 * Sends one email through an injected transport — plain text always, with an
 * optional branded HTML alternative. Provider errors are deliberately replaced
 * so response bodies, credentials, and host details do not escape into
 * callers, logs, or API responses.
 */
export async function sendEmail(
  message: EmailMessage,
  options: { from: string; transport: EmailTransport },
): Promise<void> {
  validateMessage(message, options.from);
  try {
    await options.transport.sendMail({
      from: options.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });
  } catch {
    throw new EmailDeliveryError();
  }
}

export function createSmtpEmailSender(
  configuration = smtpConfigurationFromEnvironment(),
  transport: EmailTransport = createSmtpTransport(configuration),
): EmailSender {
  return (message) => sendEmail(message, { from: configuration.from, transport });
}
