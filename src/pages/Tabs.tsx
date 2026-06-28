import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet } from '@ionic/react';
import { folderOutline, pricetagOutline, personOutline } from 'ionicons/icons';

import ProjectList from './ProjectList';
import PriceList from './PriceList';
import Cabinet from './Cabinet';
import Profile from './Profile';
import Statistics from './Statistics';

const Tabs: React.FC = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Route exact path="/tabs/projects" component={ProjectList} />
      <Route exact path="/tabs/prices" component={PriceList} />
      <Route exact path="/tabs/cabinet" component={Cabinet} />
      <Route exact path="/tabs/cabinet/profile" component={Profile} />
      <Route exact path="/tabs/cabinet/stats" component={Statistics} />
      <Route exact path="/tabs" render={() => <Redirect to="/tabs/projects" />} />
    </IonRouterOutlet>

    <IonTabBar slot="bottom">
      <IonTabButton tab="projects" href="/tabs/projects">
        <IonIcon icon={folderOutline} />
        <IonLabel>Проекты</IonLabel>
      </IonTabButton>
      <IonTabButton tab="prices" href="/tabs/prices">
        <IonIcon icon={pricetagOutline} />
        <IonLabel>Ценники</IonLabel>
      </IonTabButton>
      <IonTabButton tab="cabinet" href="/tabs/cabinet">
        <IonIcon icon={personOutline} />
        <IonLabel>Кабинет</IonLabel>
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
);

export default Tabs;
