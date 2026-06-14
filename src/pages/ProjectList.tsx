import React, { useEffect, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonItem,
  IonItemSliding, IonItemOptions, IonItemOption, IonButton,
} from '@ionic/react';
import { add, trashOutline } from 'ionicons/icons';
import { loadProjects, deleteProject } from '../lib/storage';
import { Project } from '../types';

const AVATAR_COLORS = ['#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#E53935', '#00897B', '#3949AB', '#F4511E'];

const getInitials = (name: string) => {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const getAvatarColor = (name: string) => {
  let hash = 0;
  for (const ch of (name || '')) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
};

const ProjectList: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = () => setProjects(loadProjects());
  useEffect(() => { refresh(); }, []);

  const handleDelete = (id: string) => {
    deleteProject(id);
    refresh();
  };

  const totalSqm = (p: Project) => p.rooms.reduce((s, r) => s + r.areaSqm, 0);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Проекты</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {projects.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '75vh', gap: 20, padding: '0 32px',
          }}>
            <div style={{
              width: 88, height: 88, borderRadius: 28,
              background: '#E3F2FD',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44,
            }}>
              📐
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8, color: '#1a1a1a' }}>
                Проектов пока нет
              </div>
              <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6 }}>
                Создайте первый проект, чтобы начать замер и расчёт натяжных потолков
              </div>
            </div>
            <IonButton routerLink="/new-project" style={{ '--border-radius': '14px', '--padding-start': '24px', '--padding-end': '24px' } as any}>
              <IonIcon slot="start" icon={add} />
              Создать проект
            </IonButton>
          </div>
        ) : (
          <div style={{ paddingTop: 8, paddingBottom: 88 }}>
            {projects.map(p => {
              const sqm = totalSqm(p);
              const initials = getInitials(p.clientName);
              const avatarColor = getAvatarColor(p.clientName);
              return (
                <IonItemSliding key={p.id}>
                  <IonItem
                    button
                    detail={false}
                    routerLink={`/project/${p.id}`}
                    lines="none"
                    style={{
                      '--background': 'transparent',
                      '--padding-start': '0',
                      '--padding-end': '0',
                      '--inner-padding-end': '0',
                    } as any}
                  >
                    <div style={{
                      margin: '0 16px 10px',
                      padding: '14px 16px',
                      background: '#fff',
                      borderRadius: 18,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      width: 'calc(100% - 32px)',
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 15,
                        background: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 17, flexShrink: 0,
                        letterSpacing: 0.5,
                      }}>
                        {initials}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 15, marginBottom: 3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {p.clientName || 'Без имени'}
                        </div>
                        <div style={{
                          fontSize: 12, color: '#999',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {p.address || 'Адрес не указан'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                        <div style={{
                          background: '#E3F2FD', color: '#1E88E5',
                          borderRadius: 9, padding: '3px 9px',
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {p.rooms.length} {roomWord(p.rooms.length)}
                        </div>
                        {sqm > 0 && (
                          <div style={{ fontSize: 12, color: '#aaa' }}>{sqm.toFixed(1)} м²</div>
                        )}
                      </div>
                    </div>
                  </IonItem>

                  <IonItemOptions side="end">
                    <IonItemOption color="danger" onClick={() => handleDelete(p.id)}>
                      <IonIcon slot="icon-only" icon={trashOutline} />
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              );
            })}
          </div>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton routerLink="/new-project">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

function roomWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'помещение';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'помещения';
  return 'помещений';
}

export default ProjectList;
