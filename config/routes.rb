Rails.application.routes.draw do
  devise_for :users
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  authenticated :user do
    root "pages#home", as: :authenticated_root
  end

  unauthenticated do
    root "pages#landing"
  end

  namespace :api do
    get "me", to: "users#me"
    patch "me", to: "users#update_me"
    resource :organization, only: [:show, :update]
    resources :users, only: [:index, :update, :destroy]
    resources :leads do
      post :requalify, on: :member
      resources :communications, controller: "lead_communications", only: [:index, :create, :update, :destroy]
    end
    post "x/search", to: "x_search#create"
    post "linkedin/search", to: "linkedin_search#create"
    get "connections", to: "connections#index"
    post "connections/:provider/launch", to: "connections#launch"
    delete "connections/:provider", to: "connections#disconnect"
  end

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  get "dashboard", to: "pages#home"
  get "leads", to: "pages#home"
  get "organization", to: "pages#home"
  get "profile", to: "pages#home"
end
