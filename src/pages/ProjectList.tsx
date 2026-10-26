import React, { useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonItem,
  IonItemSliding, IonItemOptions, IonItemOption,
  IonSearchbar, IonButtons, IonButton,
  useIonViewWillEnter,
} from '@ionic/react';
import { add, trashOutline, folderOpenOutline, searchOutline, closeOutline, personOutline, callOutline, locationOutline } from 'ionicons/icons';
import { loadProjects, deleteProject } from '../lib/storage';
import { projectEstimate } from '../lib/pricing';
import { Project } from '../types';
import ActionButton from '../components/ActionButton';
import { useT } from '../lib/i18n';
import './ProjectList.css';

const projectArea = (p: Project) => p.rooms.reduce((s, r) => s + r.areaSqm, 0);
const projectPrice = (p: Project) => projectEstimate(p).clientTotal;

const formatRub = (v: number) => `${Math.round(v).toLocaleString('ru')} ₽`;

/** Soft background / strong text pairs; picked by name so a client keeps one color */
const AVATAR_COLORS: [string, string][] = [
  ['#E3F2FD', '#1565C0'],
  ['#E0F2EF', '#11635F'],
  ['#FEF3C7', '#B45309'],
  ['#FCE7F3', '#BE185D'],
  ['#EDE9FE', '#6D28D9'],
  ['#DCFCE7', '#15803D'],
  ['#FFEDD5', '#C2410C'],
  ['#E0E7FF', '#4338CA'],
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(w => w.match(/\p{L}|\p{N}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const ClientAvatar: React.FC<{ name: string }> = ({ name }) => {
  const letters = initials(name);
  if (!letters) {
    return (
      <div className="client-avatar client-avatar--empty">
        <IonIcon icon={personOutline} />
      </div>
    );
  }
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  const [bg, fg] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <div className="client-avatar" style={{ background: bg, color: fg }}>
      {letters}
    </div>
  );
};

const ProjectList: React.FC = () => {
  const { t, lang } = useT();
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

  const relDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    if (diff === 0) return t('proj.today');
    if (diff === 1) return t('proj.yesterday');
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  };

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
      <IonHeader className="blue-header">
        <IonToolbar>
          {searchOpen ? (
            <>
              <IonSearchbar
                ref={searchbarRef}
                value={query}
                onIonInput={e => setQuery(e.detail.value ?? '')}
                placeholder={t('proj.search')}
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
              <IonTitle>{t('proj.title')}</IonTitle>
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
              <p className="empty-state__title">{t('proj.emptyTitle')}</p>
              <p className="empty-state__subtitle">
                {t('proj.emptySubtitle')}
              </p>
              <ActionButton solid routerLink="/new-project">
                {t('proj.create')}
              </ActionButton>
            </div>
          </div>
        ) : (
          <>
            <div className="blue-hero" />

            <div className="card-list project-list-cards blue-hero-overlap">
              {filtered.length === 0 && searchOpen ? (
                <div className="project-list-no-results card">
                  <IonIcon icon={searchOutline} />
                  <p>{t('proj.noResults')}</p>
                </div>
              ) : filtered.map(p => {
                const sqm = projectArea(p);
                const price = projectPrice(p);
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
                        <ClientAvatar name={p.clientName} />

                        <div className="project-card__body">
                          <div className="project-card__top">
                            <div className="project-card__name">{p.clientName || t('proj.noName')}</div>
                            <div className="project-card__date">{relDate(p.updatedAt || p.createdAt)}</div>
                          </div>
                          {p.phone && (
                            <div className="project-card__line">
                              <IonIcon icon={callOutline} />
                              <span>{p.phone}</span>
                            </div>
                          )}
                          <div className={`project-card__line${p.address ? '' : ' project-card__line--empty'}`}>
                            <IonIcon icon={locationOutline} />
                            <span>{p.address || t('proj.noAddress')}</span>
                          </div>

                          {p.rooms.length > 0 ? (
                            <div className="project-card__bottom">
                              <div className="project-card__tags">
                                <span className="chip">{t('proj.roomsShort', { n: p.rooms.length })}</span>
                                {sqm > 0 && <span className="chip">{sqm.toFixed(1)} м²</span>}
                              </div>
                              {price > 0 && <div className="project-card__sum">{formatRub(price)}</div>}
                            </div>
                          ) : (
                            <div className="project-card__tags">
                              <span className="chip project-card__chip-new">{t('proj.newEmpty')}</span>
                            </div>
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
          </>
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

export default ProjectList;
