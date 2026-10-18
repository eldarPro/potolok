import React, { useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonItem,
  IonItemSliding, IonItemOptions, IonItemOption,
  IonSearchbar, IonButtons, IonButton,
  useIonViewWillEnter,
} from '@ionic/react';
import { add, trashOutline, folderOpenOutline, searchOutline, closeOutline, createOutline } from 'ionicons/icons';
import { loadProjects, deleteProject } from '../lib/storage';
import { calcRoomClientPrice } from '../lib/pricing';
import { Project, Room } from '../types';
import ActionButton from '../components/ActionButton';
import RoomThumb from '../components/RoomThumb';
import { useT } from '../lib/i18n';
import './ProjectList.css';

const isDrawn = (r: Room) => r.points.length >= 3 && r.areaSqm > 0;

const projectArea = (p: Project) => p.rooms.reduce((s, r) => s + r.areaSqm, 0);
const projectPrice = (p: Project) => p.rooms.reduce((s, r) => s + calcRoomClientPrice(r), 0);

const formatRub = (v: number) => `${Math.round(v).toLocaleString('ru')} ₽`;

/** Up to four room outlines; a single room fills the whole tile */
const ProjectPreview: React.FC<{ rooms: Room[] }> = ({ rooms }) => {
  const drawn = rooms.filter(isDrawn);
  if (rooms.length === 0) {
    return (
      <div className="project-preview project-preview--empty">
        <IonIcon icon={add} />
      </div>
    );
  }
  if (drawn.length === 0) {
    return (
      <div className="project-preview project-preview--undrawn">
        <IonIcon icon={createOutline} />
      </div>
    );
  }
  if (drawn.length === 1) {
    return (
      <div className="project-preview">
        <RoomThumb points={drawn[0].points} size={76} pad={14} strokeWidth={2} />
      </div>
    );
  }
  return (
    <div className="project-preview project-preview--grid">
      {drawn.slice(0, 4).map(r => (
        <RoomThumb key={r.id} points={r.points} size={30} pad={3} strokeWidth={1.4} />
      ))}
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

  const totalArea = projects.reduce((s, p) => s + projectArea(p), 0);
  const totalPrice = projects.reduce((s, p) => s + projectPrice(p), 0);
  const totalPriceText = totalPrice >= 1_000_000
    ? new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(totalPrice) + ' ₽'
    : formatRub(totalPrice);

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
      <IonHeader className="project-list-header">
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
            <div className="project-list-hero">
              <div className="project-list-kpis">
                <div className="project-list-kpi">
                  <b>{projects.length}</b>
                  <small>{t('proj.kpiProjects')}</small>
                </div>
                <div className="project-list-kpi">
                  <b>{totalArea.toFixed(1)}</b>
                  <small>{t('proj.kpiArea')}</small>
                </div>
                <div className="project-list-kpi">
                  <b>{totalPriceText}</b>
                  <small>{t('proj.kpiSum')}</small>
                </div>
              </div>
            </div>

            <div className="card-list project-list-cards">
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
                        <ProjectPreview rooms={p.rooms} />

                        <div className="project-card__body">
                          <div className="project-card__top">
                            <div className="project-card__name">{p.clientName || t('proj.noName')}</div>
                            <div className="project-card__date">{relDate(p.updatedAt || p.createdAt)}</div>
                          </div>
                          <div className={`project-card__address${p.address ? '' : ' project-card__address--empty'}`}>
                            {p.address || t('proj.noAddress')}
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
