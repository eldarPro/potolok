Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Defines the root path route ("/")
  root "parsings#index"


  get 'get_category' => 'parsings#get_category'

  get 'parsing_start' => 'parsings#parsing_start'  

end
