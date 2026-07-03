import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async send(options: { to: string; subject: string; text: string; html?: string }) {
    const transporter = await this.getTransporter();
    if (!transporter) {
      this.logger.log(`[DEV email] To: ${options.to} | Subject: ${options.subject} | Body: ${options.text}`);
      return;
    }
    await transporter.sendMail({
      from: await this.getFromAddress(),
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    if (this.transporter) return this.transporter;

    try {
      const settings = await this.prisma.setting.findMany({
        where: { key: { in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] } },
      });
      const map: Record<string, string> = {};
      for (const s of settings) map[s.key] = s.value;

      if (!map.smtp_host || !map.smtp_user || !map.smtp_pass) {
        return null;
      }

      this.transporter = nodemailer.createTransport({
        host: map.smtp_host,
        port: parseInt(map.smtp_port || '587', 10),
        secure: parseInt(map.smtp_port || '587', 10) === 465,
        auth: { user: map.smtp_user, pass: map.smtp_pass },
      });
      return this.transporter;
    } catch {
      return null;
    }
  }

  private async getFromAddress(): Promise<string> {
    try {
      const s = await this.prisma.setting.findUnique({ where: { key: 'smtp_from' } });
      return s?.value || 'noreply@cloudnest.io';
    } catch {
      return 'noreply@cloudnest.io';
    }
  }
}
