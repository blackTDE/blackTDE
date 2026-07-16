import { useId } from 'react';
import { getAgentIconKind } from '../agentIcons';

interface AgentIconProps {
  name: string;
  size?: number;
  className?: string;
}

const antigravityIcon = 'data:image/png;base64,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';

function OpenAIIcon({ size }: { size: number }) {
  return <svg fill="currentColor" fillRule="evenodd" width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" /></svg>;
}

function ClaudeIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path fill="#D97757" d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" /></svg>;
}

function GeminiIcon({ size }: { size: number }) {
  const gradient = useId().replace(/:/g, '');
  return <svg width={size} height={size} viewBox="0 0 65 65" aria-hidden><defs><linearGradient id={gradient} x1="8" y1="57" x2="57" y2="8"><stop stopColor="#1ba1e3" /><stop offset=".5" stopColor="#8b5cf6" /><stop offset="1" stopColor="#f472b6" /></linearGradient></defs><path fill={`url(#${gradient})`} d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z" /></svg>;
}

function OpenCodeIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 240 300" aria-hidden><path d="M180 240H60V120h120v120Z" fill="#4B4646" /><path fillRule="evenodd" d="M180 60H60v180h120V60Zm60 240H0V0h240v300Z" fill="#F1ECEC" /></svg>;
}

function initials(name: string) {
  const clean = name.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
  const parts = clean.split(/[\s-]+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase() || 'AG';
}

export function AgentIcon({ name, size = 18, className = '' }: AgentIconProps) {
  const kind = getAgentIconKind(name);
  const icon = kind === 'claude' ? <ClaudeIcon size={size} />
    : kind === 'codex' ? <OpenAIIcon size={size} />
    : kind === 'antigravity' ? <img src={antigravityIcon} width={size} height={size} alt="" />
    : kind === 'gemini' ? <GeminiIcon size={size} />
    : kind === 'opencode' ? <OpenCodeIcon size={size} />
    : <span className="flex h-full w-full items-center justify-center rounded bg-slate-700 text-[7px] font-bold text-white">{initials(name)}</span>;

  return <span className={`inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }} title={name}>{icon}</span>;
}
