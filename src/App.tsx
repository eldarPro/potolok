import React from 'react';
import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.system.css';
import './theme/variables.css';
import './theme/global.css';

import Tabs from './pages/Tabs';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import RoomEditor from './pages/RoomEditor';
import RoomMaterials from './pages/RoomMaterials';
import Summary from './pages/Summary';
import CatalogList from './pages/price-list/CatalogList';
import CatalogForm from './pages/price-list/CatalogForm';
import LightingList from './pages/price-list/LightingList';
import LightingForm from './pages/price-list/LightingForm';
import ServiceList from './pages/price-list/ServiceList';
import ServiceForm from './pages/price-list/ServiceForm';
import AccessoryList from './pages/price-list/AccessoryList';
import AccessoryForm from './pages/price-list/AccessoryForm';

setupIonicReact();

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter basename={import.meta.env.BASE_URL}>
      <IonRouterOutlet>
        <Route exact path="/" render={() => <Redirect to="/tabs/projects" />} />
        <Route path="/tabs" component={Tabs} />
        <Route exact path="/new-project" component={NewProject} />
        <Route exact path="/project/:projectId/room/:roomId" component={RoomEditor} />
        <Route exact path="/project/:projectId/room/:roomId/materials/:section" component={RoomMaterials} />
        <Route exact path="/project/:id/summary" component={Summary} />
        <Route exact path="/project/:id" component={ProjectDetail} />

        <Route exact path="/price-list/fabrics" render={p => <CatalogList {...p} category="fabrics" title="Полотна" />} />
        <Route exact path="/price-list/fabrics/new" render={p => <CatalogForm {...p} category="fabrics" />} />
        <Route exact path="/price-list/fabrics/:id/edit" render={p => <CatalogForm {...p} category="fabrics" />} />

        <Route exact path="/price-list/profiles" render={p => <CatalogList {...p} category="profiles" title="Профили" />} />
        <Route exact path="/price-list/profiles/new" render={p => <CatalogForm {...p} category="profiles" />} />
        <Route exact path="/price-list/profiles/:id/edit" render={p => <CatalogForm {...p} category="profiles" />} />

        <Route exact path="/price-list/lightings" component={LightingList} />
        <Route exact path="/price-list/lightings/new" component={LightingForm} />
        <Route exact path="/price-list/lightings/:id/edit" component={LightingForm} />

        <Route exact path="/price-list/services" component={ServiceList} />
        <Route exact path="/price-list/services/new" component={ServiceForm} />
        <Route exact path="/price-list/services/:id/edit" component={ServiceForm} />

        <Route exact path="/price-list/accessories" component={AccessoryList} />
        <Route exact path="/price-list/accessories/new" component={AccessoryForm} />
        <Route exact path="/price-list/accessories/:id/edit" component={AccessoryForm} />
      </IonRouterOutlet>
    </IonReactRouter>
  </IonApp>
);

export default App;
