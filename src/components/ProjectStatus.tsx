import React from 'react';
import { IonIcon } from '@ionic/react';
import { chevronDownOutline } from 'ionicons/icons';
import { Project, ProjectStatus } from '../types';
import { STATUSES, STATUS_COLORS, statusOf } from '../lib/projectStatus';
import { upsertProject } from '../lib/storage';
import { useMenu } from './Dialogs';
import { useT } from '../lib/i18n';
import './ProjectStatus.css';

const colorVars = (s: ProjectStatus) => {
  const c = STATUS_COLORS[s];
  return { '--st-dot': c.dot, '--st-bg': c.bg, '--st-fg': c.fg } as React.CSSProperties;
};

/** Colored status chip; `onClick` turns it into a button with a ▾ */
export const StatusPill: React.FC<{ status: ProjectStatus; onClick?: () => void; className?: string }> = ({ status, onClick, className }) => {
  const { t } = useT();
  const cls = `status-pill${onClick ? ' status-pill--button' : ''}${className ? ' ' + className : ''}`;
  const content = <><i />{t(`ps.${status}`)}{onClick && <IonIcon icon={chevronDownOutline} />}</>;
  return onClick
    ? <button className={cls} style={colorVars(status)} onClick={onClick}>{content}</button>
    : <span className={cls} style={colorVars(status)}>{content}</span>;
};

/** Opens the status sheet; saves the pick and hands back the updated project */
export function useStatusMenu() {
  const { t } = useT();
  const menu = useMenu();
  return (project: Project, onSaved: (p: Project) => void) => {
    const current = statusOf(project);
    menu({
      title: t('ps.title'),
      subtitle: [project.clientName || t('proj.noName'), project.address].filter(Boolean).join(' · '),
      items: STATUSES.map(s => ({
        label: t(`ps.${s}`),
        hint: t(`ps.${s}.hint`),
        dot: STATUS_COLORS[s].dot,
        selected: s === current,
        onClick: () => {
          if (s === current) return;
          // the status isn't an edit of the project itself, so updatedAt (the card date) stays
          const updated = { ...project, status: s };
          upsertProject(updated);
          onSaved(updated);
        },
      })),
    });
  };
}
