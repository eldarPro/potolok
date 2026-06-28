import React, { useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonItem,
  IonItemSliding, IonItemOptions, IonItemOption,
  IonSearchbar, IonButtons, IonButton,
  useIonViewWillEnter,
} from '@ionic/react';
import { add, trashOutline, folderOpenOutline, locationOutline, searchOutline, closeOutline } from 'ionicons/icons';
import { loadProjects, deleteProject } from '../lib/storage';
import { Project } from '../types';
import ActionButton from '../components/ActionButton';
import './ProjectList.css';

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
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchbarRef = useRef<HTMLIonSearchbarElement>(null);

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchbarRef.current?.setFocus(), 50);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const refresh = () => setProjects(loadProjects());
  useIonViewWillEnter(() => { refresh(); });

  const handleDelete = (id: string) => {
    deleteProject(id);
    refresh();
  };

  const totalSqm = (p: Project) => p.rooms.reduce((s, r) => s + r.areaSqm, 0);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter(p =>
        p.clientName.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q)
      )
    : projects;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          {searchOpen ? (
            <>
              <IonSearchbar
                ref={searchbarRef}
                value={query}
                onIonInput={e => setQuery(e.detail.value ?? '')}
                placeholder="Поиск"
                debounce={100}
                className="project-searchbar-inline"
              />
              <IonButtons slot="end">
                <IonButton onClick={closeSearch}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </>
          ) : (
            <>
              <IonTitle>Проекты</IonTitle>
              {projects.length > 0 && (
                <IonButtons slot="end">
                  <IonButton onClick={openSearch}>
                    <IonIcon slot="icon-only" icon={searchOutline} />
                  </IonButton>
                </IonButtons>
              )}
            </>
          )}
        </IonToolbar>
      </IonHeader>

      <IonContent className="project-list-content">
        {projects.length === 0 ? (
          <div className="project-list-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap">
                <IonIcon icon={folderOpenOutline} />
              </div>
              <p className="empty-state__title">Проектов пока нет</p>
              <p className="empty-state__subtitle">
                Создайте первый проект, чтобы начать замер и расчёт натяжных потолков
              </p>
              <ActionButton solid routerLink="/new-project">
                Создать проект
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="card-list" style={{ paddingBottom: 88 }}>
            {filtered.length === 0 && searchOpen ? (
              <div className="project-list-no-results">
                <IonIcon icon={searchOutline} />
                <p>Ничего не найдено</p>
              </div>
            ) : filtered.map(p => {
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
                    className="project-list-item"
                  >
                    <div className="project-card card">
                      <div className="avatar" style={{ background: avatarColor }}>
                        {initials}
                      </div>

                      <div className="project-card__body">
                        <div className="project-card__name">{p.clientName || 'Без имени'}</div>
                        <div className="project-card__address">
                          <IonIcon icon={locationOutline} className="project-card__address-icon" />
                          {p.address || 'Адрес не указан'}
                        </div>
                      </div>

                      <div className="project-card__meta">
                        <span className="chip">
                          {p.rooms.length} {roomWord(p.rooms.length)}
                        </span>
                        {sqm > 0 && (
                          <span className="project-card__sqm">{sqm.toFixed(1)} м²</span>
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
