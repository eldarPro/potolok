Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Defines the root path route ("/")

  root 'parsings#index'   

  get 'bitcoin_tema' => 'parsings#bitcoin_tema'

end
